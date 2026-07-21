/**
 * Operações de saldo atômicas e crédito idempotente.
 * Fonte da verdade: MySQL/SQLite via Prisma ($transaction).
 */

import { randomBytes } from "crypto";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { roundMoney } from "@/lib/server/security";

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
}): Promise<{ credited: boolean }> {
  if (!isDatabaseConfigured()) return { credited: false };

  const amount = roundMoney(opts.amount);
  const fee = roundMoney(opts.feeAmount);
  const net = Math.max(0, roundMoney(amount - fee));

  try {
    return await prisma.$transaction(async (tx) => {
      let updated = 0;
      let txId: string | null = opts.transactionId ?? null;

      if (opts.transactionId) {
        const r = await tx.transaction.updateMany({
          where: {
            id: opts.transactionId,
            status: "pendente",
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
            status: "pendente",
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

      if (opts.providerId) {
        await tx.paymentCharge.updateMany({
          where: {
            OR: [
              { providerId: opts.providerId },
              { id: `vl_${opts.providerId}` },
              { id: `pp_${opts.providerId}` },
            ],
            status: "waiting_payment",
          },
          data: {
            status: "paid",
            paidAt: new Date(),
          },
        });
      }

      const user = await tx.user.update({
        where: { id: opts.sellerId },
        data: {
          balancePending: { decrement: amount },
          balanceAvailable: { increment: net },
          volumeTotal: { increment: amount },
        },
        select: { balanceAvailable: true },
      });

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

      return { credited: true };
    });
  } catch {
    return { credited: false };
  }
}
