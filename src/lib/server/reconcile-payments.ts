/**
 * Reconcilia cobranças waiting_payment com o status real na adquirente.
 * Usado por:
 * - POST /api/v1/payments/reconcile (seller/admin)
 * - auto-chamada opcional no load de transações
 */

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { syncChargeFromVelana } from "@/lib/acquirers/velana/gateway";
import { syncChargeFromPodPay } from "@/lib/acquirers/podpay/gateway";

export type ReconcileResult = {
  checked: number;
  paid: number;
  failed: number;
  stillWaiting: number;
  errors: Array<{ id: string; error: string }>;
};

/**
 * Sincroniza até `limit` cobranças pendentes (mais recentes primeiro) de um seller específico.
 */
export async function reconcilePendingPayments(opts: {
  sellerId: string;
  limit?: number;
}): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    checked: 0,
    paid: 0,
    failed: 0,
    stillWaiting: 0,
    errors: [],
  };

  if (!isDatabaseConfigured()) return result;

  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const charges = await prisma.paymentCharge.findMany({
    where: {
      status: "waiting_payment",
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
        c.provider === "podpay" || c.id.startsWith("pp_")
          ? await syncChargeFromPodPay(syncId, c.sellerId)
          : await syncChargeFromVelana(syncId, c.sellerId);

      if (charge.status === "paid") {
        result.paid++;
      } else if (charge.status === "waiting_payment") {
        result.stillWaiting++;
      } else {
        // cancelled/refunded
        result.stillWaiting++;
      }
    } catch (e) {
      result.failed++;
      result.errors.push({
        id: c.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}
