/**
 * Reconcilia cobranças waiting_payment com o status real na adquirente.
 * Usado por:
 * - POST /api/v1/payments/reconcile (seller/admin)
 * - auto-chamada opcional no load de transações
 *
 * Ordem: sync com adquirente PRIMEIRO, depois expira pendentes > 15 min
 * → status abandonada. Assim PIX pago com atraso não perde crédito.
 */

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { syncChargeFromVelana } from "@/lib/acquirers/velana/gateway";
import { syncChargeFromPodPay } from "@/lib/acquirers/podpay/gateway";
import { syncChargeFromWoovi } from "@/lib/acquirers/woovi/gateway";
import { rejectPendingSaleIdempotent } from "@/lib/server/balance";

/** TTL de PIX pendente: após isso vira abandono */
export const PENDING_SALE_TTL_MINUTES = 15;

export type ReconcileResult = {
  checked: number;
  paid: number;
  failed: number;
  stillWaiting: number;
  expired: number;
  errors: Array<{ id: string; error: string }>;
};

/**
 * Marca como abandono vendas pendentes com mais de 15 minutos
 * (ou cobrança com expiresAt no passado).
 */
export async function expireAbandonedPendingSales(opts?: {
  sellerId?: string;
  limit?: number;
  olderThanMinutes?: number;
}): Promise<{ expired: number; checked: number }> {
  const out = { expired: 0, checked: 0 };
  if (!isDatabaseConfigured()) return out;

  const minutes = Math.max(
    1,
    opts?.olderThanMinutes ?? PENDING_SALE_TTL_MINUTES
  );
  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 100);
  const cutoff = new Date(Date.now() - minutes * 60_000);
  const now = new Date();

  // 1) TX pendentes antigas
  const pendingTxs = await prisma.transaction.findMany({
    where: {
      kind: "venda",
      status: "pendente",
      date: { lte: cutoff },
      ...(opts?.sellerId ? { sellerId: opts.sellerId } : {}),
    },
    orderBy: { date: "asc" },
    take: limit,
    select: {
      id: true,
      sellerId: true,
      amount: true,
      providerId: true,
    },
  });

  // 2) Cobranças waiting_payment com expiresAt passado (mesmo se date da TX for recente)
  const expiredCharges = await prisma.paymentCharge.findMany({
    where: {
      status: "waiting_payment",
      expiresAt: { lte: now },
      ...(opts?.sellerId ? { sellerId: opts.sellerId } : {}),
    },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: {
      id: true,
      sellerId: true,
      amount: true,
      providerId: true,
      transactionId: true,
    },
  });

  const seen = new Set<string>();
  type Item = {
    transactionId: string;
    sellerId: string;
    amount: number;
    providerId: string | null;
  };
  const queue: Item[] = [];

  for (const t of pendingTxs) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    queue.push({
      transactionId: t.id,
      sellerId: t.sellerId,
      amount: Number(t.amount) || 0,
      providerId: t.providerId,
    });
  }
  for (const c of expiredCharges) {
    const txId = c.transactionId || c.id;
    if (!txId || seen.has(txId)) continue;
    seen.add(txId);
    queue.push({
      transactionId: txId,
      sellerId: c.sellerId,
      amount: Number(c.amount) || 0,
      providerId: c.providerId,
    });
  }

  for (const item of queue) {
    out.checked++;
    try {
      const r = await rejectPendingSaleIdempotent({
        transactionId: item.transactionId,
        sellerId: item.sellerId,
        amount: item.amount,
        providerId: item.providerId,
        txStatus: "abandonada",
        chargeStatus: "expired",
      });
      if (r.applied) out.expired++;
    } catch {
      /* segue o lote */
    }
  }

  return out;
}

/**
 * Sincroniza até `limit` cobranças pendentes (mais recentes primeiro).
 * Se sellerId for passado, só daquele seller.
 * Sync com adquirente primeiro; depois expira abandonos (15 min).
 */
export async function reconcilePendingPayments(opts: {
  sellerId?: string;
  limit?: number;
}): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    checked: 0,
    paid: 0,
    failed: 0,
    stillWaiting: 0,
    expired: 0,
    errors: [],
  };

  if (!isDatabaseConfigured()) return result;

  // 1) SINCRONIZA primeiro com a adquirente (pode creditar PIX pago)
  // 2) SÓ DEPOIS expira o que ainda está pendente > 15 min
  // Ordem invertida evita abandonar venda que já foi paga na adquirente
  // e só depois perder o crédito no sync (charge já expired).
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  // Inclui expired: PIX pode pagar após TTL local (abandon) e precisa de sync
  const charges = await prisma.paymentCharge.findMany({
    where: {
      status: { in: ["waiting_payment", "expired"] },
      ...(opts?.sellerId ? { sellerId: opts.sellerId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      provider: true,
      providerId: true,
      sellerId: true,
      transactionId: true,
    },
  });

  for (const c of charges) {
    result.checked++;
    const syncId =
      c.transactionId ||
      c.id ||
      c.providerId ||
      "";
    if (!syncId) {
      result.failed++;
      result.errors.push({ id: c.id, error: "missing_ids" });
      continue;
    }

    try {
      const charge =
        c.provider === "woovi" || c.id.startsWith("wo_")
          ? await syncChargeFromWoovi(syncId, c.sellerId)
          : c.provider === "podpay" || c.id.startsWith("pp_")
            ? await syncChargeFromPodPay(syncId, c.sellerId)
            : await syncChargeFromVelana(syncId, c.sellerId);

      if (charge.status === "paid") {
        result.paid++;
      } else if (charge.status === "waiting_payment") {
        result.stillWaiting++;
      } else {
        result.failed++;
      }
    } catch (e) {
      result.failed++;
      result.errors.push({
        id: c.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Expira abandonos só após o sync — late paid já foi creditado acima
  try {
    const exp = await expireAbandonedPendingSales({
      sellerId: opts?.sellerId,
      limit: opts?.limit ?? 40,
    });
    result.expired = exp.expired;
  } catch {
    /* best-effort */
  }

  return result;
}

export type WithdrawalReconcileResult = {
  checked: number;
  paid: number;
  failed: number;
  stillPending: number;
  errors: Array<{ id: string; error: string }>;
};

/**
 * Reconcilia saques "processando" com o status real na adquirente.
 * Cobre o caso em que o webhook chegou com status desconhecido
 * (ex.: Velana `success`) ou não chegou.
 */
export async function reconcilePendingWithdrawals(opts?: {
  sellerId?: string;
  limit?: number;
}): Promise<WithdrawalReconcileResult> {
  const result: WithdrawalReconcileResult = {
    checked: 0,
    paid: 0,
    failed: 0,
    stillPending: 0,
    errors: [],
  };
  if (!isDatabaseConfigured()) return result;

  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const rows = await prisma.withdrawal.findMany({
    where: {
      status: "processando",
      ...(opts?.sellerId ? { sellerId: opts.sellerId } : {}),
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  const {
    finalizeWithdrawalPaid,
    finalizeWithdrawalFailed,
  } = await import("@/lib/server/db/admin-withdrawals.service");

  for (const w of rows) {
    result.checked++;
    const provider = String(w.provider || "").toLowerCase();
    const remoteId = String(w.providerId || w.id || "").trim();
    if (!remoteId || remoteId.startsWith("SQ-") || provider.startsWith("pending")) {
      result.stillPending++;
      continue;
    }

    try {
      let mapped: "pago" | "recusado" | "processando" = "processando";

      if (provider === "velana") {
        const { resolveVelanaConfigServer } = await import(
          "@/lib/acquirers/velana/config"
        );
        const { velanaClient } = await import("@/lib/acquirers/velana/client");
        const { mapVelanaTransferStatus } = await import(
          "@/lib/acquirers/velana/mappers"
        );
        const config = await resolveVelanaConfigServer();
        if (!config?.secretKey) {
          result.stillPending++;
          continue;
        }
        const remote = await velanaClient.getTransfer(remoteId, config);
        mapped = mapVelanaTransferStatus(remote.status);
      } else if (provider === "woovi" || provider === "openpix") {
        const { resolveWooviConfigServer } = await import(
          "@/lib/acquirers/woovi/config"
        );
        const { wooviClient } = await import("@/lib/acquirers/woovi/client");
        const { mapWooviPaymentStatus } = await import(
          "@/lib/acquirers/woovi/mappers"
        );
        const config = await resolveWooviConfigServer();
        if (!config?.appId) {
          result.stillPending++;
          continue;
        }
        const remote = await wooviClient.getPayment(remoteId, config);
        const payment =
          (remote as { payment?: { status?: string } }).payment ||
          (remote as { status?: string });
        mapped = mapWooviPaymentStatus(payment?.status);
      } else if (provider === "podpay") {
        const { podpayClient } = await import("@/lib/acquirers/podpay/client");
        const { mapPodPayWithdrawalStatus } = await import(
          "@/lib/acquirers/podpay/mappers"
        );
        const { isPodPayEnabled } = await import(
          "@/lib/acquirers/podpay/config"
        );
        if (!isPodPayEnabled()) {
          result.stillPending++;
          continue;
        }
        const remote = await podpayClient.getWithdrawal(remoteId);
        mapped = mapPodPayWithdrawalStatus(
          (remote as { status?: string }).status || ""
        );
      } else {
        result.stillPending++;
        continue;
      }

      if (mapped === "pago") {
        const r = await finalizeWithdrawalPaid(w.id, {
          provider: provider || w.provider,
          providerId: remoteId,
          source: "reconcile_withdrawal",
        });
        if (r.applied || r.reason === "already_paid") result.paid++;
        else result.stillPending++;
      } else if (mapped === "recusado") {
        const r = await finalizeWithdrawalFailed(w.id, {
          reason: "Adquirente recusou (reconcile)",
          source: "reconcile_withdrawal",
        });
        if (r.applied || r.reason === "already_rejected") result.failed++;
        else result.stillPending++;
      } else {
        result.stillPending++;
      }
    } catch (e) {
      result.failed++;
      result.errors.push({
        id: w.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}
