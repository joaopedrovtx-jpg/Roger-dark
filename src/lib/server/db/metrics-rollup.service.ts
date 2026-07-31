/**
 * Materializa métricas diárias na tabela `MetricDaily` (scope="seller" e
 * scope="platform"). Reduz custo de `getAdminDashboardMetrics` que hoje
 * agrega on-the-fly em janelas longas (30/60 dias).
 *
 * O id é BigInt auto-incremento; chave única é (scope, userId, date).
 * Para seller: userId = o id do seller. Para platform: userId = null.
 */

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { computeSaleNetAmount, getSellerSaleFees } from "@/lib/server/seller-fees";
import { roundMoney } from "@/lib/server/security";

export type MetricScope = "seller" | "platform";

export interface RollupInput {
  scope: MetricScope;
  userId?: string | null;
  date: Date; // deve ser meia-noite local (SP) daquele dia
}

export interface RollupResult {
  ok: boolean;
  scope: MetricScope;
  userId: string | null;
  date: string;
}

function startOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function rangeOfDay(date: Date): { start: Date; end: Date } {
  const start = startOfDay(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function emptyMetric() {
  return {
    volumeGross: 0,
    volumeNet: 0,
    platformRevenue: 0,
    sellerProfit: 0,
    txCount: 0,
    txPaid: 0,
    txPending: 0,
    txFailed: 0,
    txRefunded: 0,
    averageTicket: 0,
    conversionRate: 0,
    outflowTotal: 0,
    withdrawalCount: 0,
    withdrawalPaid: 0,
    withdrawalPending: 0,
    withdrawalFees: 0,
    heldBalanceEod: 0,
  };
}

/** Agrega 1 dia para o seller (userId obrigatório). */
export async function rollupSellerDay(
  userId: string,
  date: Date
): Promise<RollupResult> {
  const day = startOfDay(date);
  const { start, end } = rangeOfDay(day);

  if (!(await dbOk())) {
    return { ok: false, scope: "seller", userId, date: day.toISOString() };
  }

  const [txs, withdrawals, userEnd] = await Promise.all([
    prisma.transaction.findMany({
      where: { sellerId: userId, date: { gte: start, lt: end } },
    }),
    prisma.withdrawal.findMany({
      where: { sellerId: userId, date: { gte: start, lt: end } },
    }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  const m = emptyMetric();
  let gross = 0;
  let net = 0;
  let platformRev = 0;
  let sellerProfit = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  let refundedCount = 0;

  const fees = await getSellerSaleFees(userId).catch(() => ({
    mdrPercent: 0,
    mdrFixed: 0,
  }));

  for (const t of txs) {
    if (t.kind !== "venda") continue;
    m.txCount += 1;
    const amount = roundMoney(t.amount);
    gross += amount;
    if (t.status === "aprovada") {
      paidCount += 1;
      const { fee, net: netAmount } = computeSaleNetAmount(amount, fees);
      net += netAmount;
      platformRev += roundMoney(fee);
      sellerProfit += netAmount;
    } else if (t.status === "pendente") {
      pendingCount += 1;
    } else if (t.status === "recusada") {
      failedCount += 1;
    } else if (t.status === "reembolsada") {
      refundedCount += 1;
    }
  }
  m.txPaid = paidCount;
  m.txPending = pendingCount;
  m.txFailed = failedCount;
  m.txRefunded = refundedCount;
  m.volumeGross = roundMoney(gross);
  m.volumeNet = roundMoney(net);
  m.platformRevenue = roundMoney(platformRev);
  m.sellerProfit = roundMoney(sellerProfit);
  m.averageTicket = paidCount > 0 ? roundMoney(gross / paidCount) : 0;
  m.conversionRate = m.txCount > 0 ? roundMoney((paidCount / m.txCount) * 100) : 0;

  let wPaid = 0;
  let wPending = 0;
  let wFees = 0;
  for (const w of withdrawals) {
    m.withdrawalCount += 1;
    const amt = roundMoney(w.amount);
    m.outflowTotal += amt;
    if (w.status === "pago") {
      wPaid += amt;
    } else if (w.status === "processando" || w.status === "pendente") {
      wPending += amt;
    }
    const fee = roundMoney(
      (amt * (w.feePercent ?? 0)) / 100 + (w.feeFixed ?? 0)
    );
    wFees += fee;
  }
  m.withdrawalPaid = roundMoney(wPaid);
  m.withdrawalPending = roundMoney(wPending);
  m.withdrawalFees = roundMoney(wFees);
  m.heldBalanceEod = roundMoney(userEnd?.balanceHeld ?? 0);

  await prisma.metricDaily.upsert({
    where: { scope_userId_date: { scope: "seller", userId, date: day } },
    create: { scope: "seller", userId, date: day, ...m },
    update: m,
  });

  return { ok: true, scope: "seller", userId, date: day.toISOString() };
}

/** Agrega 1 dia para a plataforma (soma de todos os sellers). */
export async function rollupPlatformDay(date: Date): Promise<RollupResult> {
  const day = startOfDay(date);
  const { start, end } = rangeOfDay(day);

  if (!(await dbOk())) {
    return { ok: false, scope: "platform", userId: null, date: day.toISOString() };
  }

  const [txs, withdrawals, heldSum] = await Promise.all([
    prisma.transaction.findMany({
      where: { kind: "venda", date: { gte: start, lt: end } },
    }),
    prisma.withdrawal.findMany({ where: { date: { gte: start, lt: end } } }),
    prisma.user.aggregate({ _sum: { balanceHeld: true } }),
  ]);

  const m = emptyMetric();
  let gross = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  let refundedCount = 0;
  for (const t of txs) {
    m.txCount += 1;
    gross += roundMoney(t.amount);
    if (t.status === "aprovada") paidCount += 1;
    else if (t.status === "pendente") pendingCount += 1;
    else if (t.status === "recusada") failedCount += 1;
    else if (t.status === "reembolsada") refundedCount += 1;
  }
  m.txPaid = paidCount;
  m.txPending = pendingCount;
  m.txFailed = failedCount;
  m.txRefunded = refundedCount;
  m.volumeGross = roundMoney(gross);
  m.averageTicket = paidCount > 0 ? roundMoney(gross / paidCount) : 0;
  m.conversionRate = m.txCount > 0 ? roundMoney((paidCount / m.txCount) * 100) : 0;

  let wPaid = 0;
  let wPending = 0;
  let wFees = 0;
  for (const w of withdrawals) {
    m.withdrawalCount += 1;
    const amt = roundMoney(w.amount);
    m.outflowTotal += amt;
    if (w.status === "pago") wPaid += amt;
    else if (w.status === "processando" || w.status === "pendente") wPending += amt;
    wFees += roundMoney(
      (amt * (w.feePercent ?? 0)) / 100 + (w.feeFixed ?? 0)
    );
  }
  m.withdrawalPaid = roundMoney(wPaid);
  m.withdrawalPending = roundMoney(wPending);
  m.withdrawalFees = roundMoney(wFees);
  m.heldBalanceEod = roundMoney(heldSum._sum.balanceHeld ?? 0);

  await prisma.metricDaily.upsert({
    where: { scope_userId_date: { scope: "platform", userId: "", date: day } },
    create: { scope: "platform", userId: "", date: day, ...m },
    update: m,
  });

  return { ok: true, scope: "platform", userId: null, date: day.toISOString() };
}

/** Rola um intervalo de dias (inclusivo) — bom para backfill/cron. */
export async function rollupRange(
  startDate: Date,
  endDate: Date,
  scope: MetricScope,
  userId?: string | null
): Promise<RollupResult[]> {
  const out: RollupResult[] = [];
  const cursor = startOfDay(startDate);
  const end = startOfDay(endDate);
  while (cursor.getTime() <= end.getTime()) {
    if (scope === "seller" && userId) {
      out.push(await rollupSellerDay(userId, cursor));
    } else if (scope === "platform") {
      out.push(await rollupPlatformDay(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

async function dbOk(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}