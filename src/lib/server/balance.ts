/**
 * Operações de saldo atômicas e crédito idempotente.
 * Fonte da verdade: MySQL/SQLite via Prisma.
 */

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

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
  if (amount <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  // updateMany com condição evita race (dois saques simultâneos)
  const result = await prisma.user.updateMany({
    where: {
      id: sellerId,
      balanceAvailable: { gte: amount },
    },
    data: {
      balanceAvailable: { decrement: amount },
    },
  });

  if (result.count === 0) {
    return { ok: false, reason: "insufficient_balance" };
  }

  const user = await prisma.user.findUnique({
    where: { id: sellerId },
    select: { balanceAvailable: true },
  });

  return {
    ok: true,
    newBalance: Number(user?.balanceAvailable ?? 0),
  };
}

/**
 * Credita venda paga de forma idempotente:
 * só move pending → available se a TX ainda estiver "pendente".
 * Retorna se o crédito foi aplicado nesta chamada.
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

  const amount = opts.amount;
  const fee = opts.feeAmount;
  const net = Math.max(0, Math.round((amount - fee) * 100) / 100);

  // 1) Atualiza transaction pendente → aprovada (só 1x)
  let updated = 0;
  if (opts.transactionId) {
    const r = await prisma.transaction.updateMany({
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
    const r = await prisma.transaction.updateMany({
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
  }

  if (updated === 0) {
    // Já processada ou não encontrada
    return { credited: false };
  }

  // 2) Charge → paid
  if (opts.providerId) {
    await prisma.paymentCharge.updateMany({
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

  // 3) Saldo: pending → available + volume
  await prisma.user.update({
    where: { id: opts.sellerId },
    data: {
      balancePending: { decrement: amount },
      balanceAvailable: { increment: net },
      volumeTotal: { increment: amount },
    },
  });

  return { credited: true };
}
