/**
 * Operações de saldo atômicas e crédito idempotente.
 * Fonte da verdade: MySQL/SQLite via Prisma ($transaction).
 */

import { randomBytes } from "crypto";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { roundMoney } from "@/lib/server/security";
import { notifySaleApproved } from "@/lib/server/notify-email";

function newLedgerId(): string {
  return `led_${Date.now().toString(36)}_${randomBytes(6).toString("base64url")}`;
}

/**
 * Debita saldo disponível de forma atômica.
 * Só sucede se balanceAvailable >= amount.
 */
export async function debitAvailableBalance(
  sellerId: string,
  amount: number
): Promise<{ ok: true; newBalance: number } | { ok: false; reason: string }> {
  if (!isDatabaseConfigured()) {
    return { ok: false, reason: "database_unavailable" };
  }
  const amt = roundMoney(amount);
  if (amt <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  try {
    const newBalance = await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: {
          id: sellerId,
          balanceAvailable: { gte: amt },
        },
        data: {
          balanceAvailable: { decrement: amt },
        },
      });

      if (result.count === 0) {
        return null;
      }

      const user = await tx.user.findUnique({
        where: { id: sellerId },
        select: { balanceAvailable: true },
      });

      await tx.balanceLedger.create({
        data: {
          id: newLedgerId(),
          userId: sellerId,
          type: "debit_available",
          amount: -amt,
          bucket: "available",
          balanceAfter: Number(user?.balanceAvailable ?? 0),
          referenceType: "withdrawal",
          description: "Débito saldo disponível",
        },
      });

      return Number(user?.balanceAvailable ?? 0);
    });

    if (newBalance === null) {
      return { ok: false, reason: "insufficient_balance" };
    }
    return { ok: true, newBalance };
  } catch {
    return { ok: false, reason: "debit_failed" };
  }
}

/**
 * Credita venda paga de forma idempotente dentro de uma única transaction.
 */
export async function creditPaidSaleIdempotent(opts: {
  transactionId?: string | null;
  providerId?: string | null;
  provider?: string | null;
  sellerId: string;
  amount: number;
  feeAmount: number;
}): Promise<{ credited: boolean; transactionId?: string | null }> {
  if (!isDatabaseConfigured()) return { credited: false };

  const amount = roundMoney(opts.amount);
  const fee = roundMoney(opts.feeAmount);
  const net = Math.max(0, roundMoney(amount - fee));

  let credited = false;
  try {
    const result = await prisma.$transaction(async (tx) => {
      let updated = 0;
      let txId: string | null = opts.transactionId ?? null;

      // Aceita pendente E abandonada (PIX pago após TTL 15 min)
      const creditFromStatuses = ["pendente", "abandonada"] as const;

      if (opts.transactionId) {
        const r = await tx.transaction.updateMany({
          where: {
            id: opts.transactionId,
            status: { in: [...creditFromStatuses] },
          },
          data: {
            status: "aprovada",
            paidAt: new Date(),
          },
        });
        updated = r.count;
      } else if (opts.providerId) {
        const r = await tx.transaction.updateMany({
          where: {
            providerId: opts.providerId,
            ...(opts.provider ? { provider: opts.provider } : {}),
            status: { in: [...creditFromStatuses] },
          },
          data: {
            status: "aprovada",
            paidAt: new Date(),
          },
        });
        updated = r.count;
        if (updated > 0) {
          const found = await tx.transaction.findFirst({
            where: {
              providerId: opts.providerId,
              ...(opts.provider ? { provider: opts.provider } : {}),
              status: "aprovada",
            },
            select: { id: true },
          });
          txId = found?.id ?? null;
        }
      }

      if (updated === 0) {
        return { credited: false };
      }

      // Charge pode estar waiting_payment OU expired (após abandono)
      if (opts.providerId) {
        const pid = opts.providerId;
        await tx.paymentCharge.updateMany({
          where: {
            OR: [
              { providerId: pid },
              { id: `vl_${pid}` },
              { id: `pp_${pid}` },
              { id: pid.startsWith("wo_") ? pid : `wo_${pid}`.slice(0, 64) },
              ...(opts.transactionId
                ? [{ transactionId: opts.transactionId }]
                : []),
            ],
            status: { in: ["waiting_payment", "expired"] },
          },
          data: {
            status: "paid",
            paidAt: new Date(),
          },
        });
      } else if (opts.transactionId) {
        await tx.paymentCharge.updateMany({
          where: {
            transactionId: opts.transactionId,
            status: { in: ["waiting_payment", "expired"] },
          },
          data: {
            status: "paid",
            paidAt: new Date(),
          },
        });
      }

      // Se veio de abandonada, pending já foi decrementado no abandon —
      // só credita available. Se veio de pendente, move pending → available.
      // CAS: só decrementa pending se houver saldo suficiente (floor ≥ 0).
      const decPending = await tx.user.updateMany({
        where: {
          id: opts.sellerId,
          balancePending: { gte: amount },
        },
        data: {
          balancePending: { decrement: amount },
        },
      });

      const user = await tx.user.update({
        where: { id: opts.sellerId },
        data: {
          balanceAvailable: { increment: net },
          volumeTotal: { increment: amount },
        },
        select: { balanceAvailable: true },
      });
      void decPending;

      await tx.balanceLedger.create({
        data: {
          id: newLedgerId(),
          userId: opts.sellerId,
          type: "credit_sale",
          amount: net,
          bucket: "available",
          balanceAfter: Number(user.balanceAvailable),
          referenceType: "transaction",
          referenceId: txId,
          description: "Crédito venda paga",
        },
      });

      return { credited: true, transactionId: txId };
    });
    credited = result.credited;
    return result;
  } catch {
    return { credited: false };
  } finally {
    if (credited && opts.sellerId && opts.amount > 0) {
      notifySaleApproved(opts.sellerId, opts.amount).catch(async (e) => {
        const { log } = await import("@/lib/server/logger");
        log.warn({ sellerId: opts.sellerId, amount: opts.amount, error: e instanceof Error ? e.message : String(e) }, "notify_sale_approved_failed");
      });
    }
  }
}

/**
 * Cancela / marca recusada (ou abandonada) uma venda ainda pendente (CAS).
 * Só decrementa balancePending se a TX passou de pendente → terminal.
 */
export async function rejectPendingSaleIdempotent(opts: {
  transactionId: string;
  sellerId: string;
  amount: number;
  chargeStatus?: "cancelled" | "refunded" | "expired";
  /** Status final da TX (default recusada; use abandonada no TTL 15 min) */
  txStatus?: "recusada" | "abandonada";
  providerId?: string | null;
}): Promise<{ applied: boolean }> {
  if (!isDatabaseConfigured()) return { applied: false };
  const amount = roundMoney(opts.amount);
  const nextStatus = opts.txStatus || "recusada";
  const chargeStatus = opts.chargeStatus || "cancelled";
  try {
    return await prisma.$transaction(async (tx) => {
      const r = await tx.transaction.updateMany({
        where: { id: opts.transactionId, status: "pendente" },
        data: { status: nextStatus },
      });
      if (r.count === 0) return { applied: false };

      // Floor: nunca deixa balancePending negativo
      const dec = await tx.user.updateMany({
        where: {
          id: opts.sellerId,
          balancePending: { gte: amount },
        },
        data: { balancePending: { decrement: amount } },
      });
      if (dec.count === 0) {
        // pending insuficiente (legado/inconsistente) — zera se positivo
        const seller = await tx.user.findUnique({
          where: { id: opts.sellerId },
          select: { balancePending: true },
        });
        const pendingNow = Number(seller?.balancePending ?? 0);
        if (pendingNow > 0) {
          await tx.user.update({
            where: { id: opts.sellerId },
            data: { balancePending: { decrement: pendingNow } },
          });
        }
      }

      if (opts.providerId) {
        const pid = opts.providerId;
        await tx.paymentCharge.updateMany({
          where: {
            OR: [
              { providerId: pid },
              { id: `vl_${pid}` },
              { id: `pp_${pid}` },
              { id: pid.startsWith("wo_") ? pid : `wo_${pid}`.slice(0, 64) },
              { transactionId: opts.transactionId },
            ],
            status: "waiting_payment",
          },
          data: { status: chargeStatus },
        });
      } else {
        await tx.paymentCharge.updateMany({
          where: {
            transactionId: opts.transactionId,
            status: "waiting_payment",
          },
          data: { status: chargeStatus },
        });
      }

      return { applied: true };
    });
  } catch {
    return { applied: false };
  }
}

/**
 * Reembolso de venda:
 * - Se ainda pendente: CAS pendente → reembolsada + decrementa pending
 * - Se já aprovada: CAS aprovada → reembolsada + debita available (líquido)
 */
export async function refundSaleIdempotent(opts: {
  transactionId: string;
  sellerId: string;
  amount: number;
  feeAmount: number;
  netAmount?: number;
  providerId?: string | null;
}): Promise<{ applied: boolean; path?: "pending" | "paid" }> {
  if (!isDatabaseConfigured()) return { applied: false };
  const amount = roundMoney(opts.amount);
  const fee = roundMoney(opts.feeAmount);
  const net = roundMoney(
    opts.netAmount != null ? opts.netAmount : Math.max(0, amount - fee)
  );

  try {
    return await prisma.$transaction(async (tx) => {
      // 1) Ainda pendente
      const pend = await tx.transaction.updateMany({
        where: { id: opts.transactionId, status: "pendente" },
        data: { status: "reembolsada", refundedAt: new Date() },
      });
      if (pend.count === 1) {
        await tx.user.updateMany({
          where: { id: opts.sellerId, balancePending: { gte: amount } },
          data: { balancePending: { decrement: amount } },
        });
        await tx.paymentCharge.updateMany({
          where: {
            OR: [
              ...(opts.providerId
                ? [
                    { providerId: opts.providerId },
                    { id: `vl_${opts.providerId}` },
                    { id: `pp_${opts.providerId}` },
                    { id: `wo_${opts.providerId}` },
                  ]
                : []),
              { transactionId: opts.transactionId },
            ],
          },
          data: { status: "refunded" },
        });
        return { applied: true, path: "pending" as const };
      }

      // 2) Já paga → estorna available
      const paid = await tx.transaction.updateMany({
        where: { id: opts.transactionId, status: "aprovada" },
        data: { status: "reembolsada", refundedAt: new Date() },
      });
      if (paid.count === 0) return { applied: false };

      const userUp = await tx.user.updateMany({
        where: {
          id: opts.sellerId,
          balanceAvailable: { gte: net },
        },
        data: {
          balanceAvailable: { decrement: net },
          volumeTotal: { decrement: amount },
        },
      });
      if (userUp.count === 0) {
        throw new Error("saldo_insuficiente_para_reembolso");
      }

      const user = await tx.user.findUnique({
        where: { id: opts.sellerId },
        select: { balanceAvailable: true },
      });

      await tx.paymentCharge.updateMany({
        where: {
          OR: [
            ...(opts.providerId
              ? [
                  { providerId: opts.providerId },
                  { id: `vl_${opts.providerId}` },
                  { id: `pp_${opts.providerId}` },
                  { id: `wo_${opts.providerId}` },
                ]
              : []),
            { transactionId: opts.transactionId },
          ],
        },
        data: { status: "refunded" },
      });

      await tx.balanceLedger.create({
        data: {
          id: newLedgerId(),
          userId: opts.sellerId,
          type: "debit_refund",
          amount: -net,
          bucket: "available",
          balanceAfter: Number(user?.balanceAvailable ?? 0),
          referenceType: "transaction",
          referenceId: opts.transactionId,
          description: "Estorno venda reembolsada",
        },
      });

      return { applied: true, path: "paid" as const };
    });
  } catch {
    return { applied: false };
  }
}

/**
 * Após crédito bem-sucedido: notifica UTMify (server-side tracking).
 * Chame fora da $transaction Prisma.
 */
export async function notifyUtmifyAfterPaid(opts: {
  sellerId: string;
  orderId: string;
  amount: number;
  feeAmount: number;
  description?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerDocument?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date | string | null;
}): Promise<void> {
  try {
    const { pushSaleToUtmifyBackground } = await import(
      "@/lib/integrations/utmify/service"
    );
    const net = Math.max(0, roundMoney(opts.amount - opts.feeAmount));
    pushSaleToUtmifyBackground({
      sellerId: opts.sellerId,
      orderId: opts.orderId,
      status: "paid",
      amount: opts.amount,
      feeAmount: opts.feeAmount,
      netAmount: net,
      description: opts.description,
      customerName: opts.customerName,
      customerEmail: opts.customerEmail,
      customerDocument: opts.customerDocument,
      metadata: opts.metadata,
      createdAt: opts.createdAt || new Date(),
      approvedDate: new Date(),
    });
  } catch (e) {
    const { log } = await import("@/lib/server/logger");
    log.warn({ sellerId: opts.sellerId, amount: opts.amount, error: e instanceof Error ? e.message : String(e) }, "utmify_push_failed");
  }
}
