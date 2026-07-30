import type { AdminMetrics } from "@/lib/domain/types";
import { isDatabaseConfigured, prisma } from "@/lib/server/prisma";
import {
  daysForPeriod,
  fillChartSeries,
  type ChartPeriodKey,
} from "@/lib/chart-series";
import {
  endOfZonedDay,
  startOfZonedDay,
  toISODateInZone,
} from "@/lib/timezone";

export type AdminLedgerRow = {
  id: string;
  date: string;
  userName: string;
  kind: "venda" | "saque";
  direction: "entrada" | "saida";
  description: string;
  method: string;
  amount: number;
  status: string;
};

export type VolumePoint = {
  date: string;
  amount: number;
  grain?: "hour" | "day";
};

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

export async function dbAvailable(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Início do período em America/Sao_Paulo (alinhado ao gráfico).
 */
export function adminPeriodStart(period?: ChartPeriodKey | string | null): Date {
  if (period === "today") return startOfZonedDay(0);
  if (period === "yesterday") return startOfZonedDay(1);
  const days = daysForPeriod(period || "7d");
  return startOfZonedDay(days - 1);
}

function adminPeriodEnd(period?: ChartPeriodKey | string | null): Date {
  if (period === "yesterday") return endOfZonedDay(1);
  return endOfZonedDay(0);
}

/**
 * Métricas do admin.
 * - Volume / receita / ticket / conversão / txs: filtrados pelo `period` (mesmo do gráfico)
 * - Usuários / saldos / pendências: snapshot atual (não dependem do filtro)
 */
export async function getAdminDashboardMetrics(
  period?: ChartPeriodKey | string | null
): Promise<AdminMetrics | null> {
  if (!(await dbAvailable())) return null;

  const from = adminPeriodStart(period);
  const to = adminPeriodEnd(period);

  const saleDate = { gte: from, lte: to };
  const wdDate = { gte: from, lte: to };
  // Vendas pagas: preferir paidAt (quando o dinheiro entrou)
  const paidWhere = {
    kind: "venda" as const,
    status: "aprovada" as const,
    OR: [
      { paidAt: saleDate },
      { paidAt: null, date: saleDate },
    ],
  };

  const [
    users,
    paidSales,
    decidedSales,
    totalSalesCount,
    paidWdFees,
    pendingWd,
    acquirersActive,
    pendingDocs,
    balAgg,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["status"], _count: true }),
    prisma.transaction.aggregate({
      where: paidWhere,
      _sum: { amount: true, platformFee: true },
      _count: true,
    }),
    prisma.transaction.count({
      where: {
        kind: "venda",
        status: { in: ["aprovada", "recusada", "reembolsada"] },
        date: saleDate,
      },
    }),
    prisma.transaction.count({
      where: { kind: "venda", date: saleDate },
    }),
    prisma.withdrawal.aggregate({
      where: { status: "pago", date: wdDate },
      _sum: { feeAmount: true },
    }),
    prisma.withdrawal.aggregate({
      where: { status: "processando" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.acquirer.count({
      where: { status: "ativo", enabled: true },
    }),
    prisma.document.count({ where: { status: "pendente" } }),
    prisma.user.aggregate({
      _sum: {
        balanceHeld: true,
        balanceAvailable: true,
        balancePending: true,
        platformProfit: true,
      },
    }),
  ]);

  const countBy = (s: string) =>
    users.find((u) => u.status === s)?._count ?? 0;

  const totalUsers = users.reduce((a, u) => a + u._count, 0);
  const volumeProcessed = n(paidSales._sum.amount);
  const platformFromTx = n(paidSales._sum.platformFee);
  const platformFromWd = n(paidWdFees._sum.feeAmount);
  const paidCount = paidSales._count;
  const averageTicket = paidCount > 0 ? volumeProcessed / paidCount : 0;
  const conversionRate =
    decidedSales > 0 ? (paidCount / decidedSales) * 100 : 0;
  const platformRevenue = platformFromTx + platformFromWd;

  // Custo das adquirentes (feePercent + feeFixed configurados no Admin)
  // descontado por transação paga e por saque pago no período.
  const acquirerCost = await computeAcquirerCost({
    saleWhere: paidWhere,
    wdDate,
  });
  const platformNetProfit = round2(platformRevenue - acquirerCost);

  return {
    totalUsers,
    activeUsers: countBy("ativo"),
    pendingUsers: countBy("pendente"),
    blockedUsers: countBy("bloqueado"),
    pendingDocs,
    pendingSaques: pendingWd._count,
    pendingSaquesAmount: n(pendingWd._sum.amount),
    volumeProcessed,
    platformRevenue,
    platformRevenueSales: platformFromTx,
    platformRevenueWithdrawals: platformFromWd,
    platformAcquirerCost: acquirerCost,
    platformNetProfit,
    activeAdquirentes: acquirersActive,
    totalTransactions: totalSalesCount,
    averageTicket,
    totalHeldBalance: n(balAgg._sum.balanceHeld),
    totalAvailableBalance: n(balAgg._sum.balanceAvailable),
    totalPendingBalance: n(balAgg._sum.balancePending),
    conversionRate: Math.round(conversionRate * 10) / 10,
  };
}

function round2(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

/**
 * Soma o custo das adquirentes no período:
 * por venda paga: amount * feePercent/100 + feeFixed
 * por saque pago: feeFixed da adquirente (PIX out)
 */
async function computeAcquirerCost(opts: {
  saleWhere: {
    kind: "venda";
    status: "aprovada";
    OR: Array<Record<string, unknown>>;
  };
  wdDate: { gte: Date; lte: Date };
}): Promise<number> {
  const acquirers = await prisma.acquirer.findMany({
    select: {
      id: true,
      code: true,
      feePercent: true,
      feeFixed: true,
    },
  });

  type Fee = { feePercent: number; feeFixed: number };
  const byKey = new Map<string, Fee>();
  for (const a of acquirers) {
    const fee: Fee = {
      feePercent: n(a.feePercent),
      feeFixed: n(a.feeFixed),
    };
    byKey.set(a.id.toLowerCase(), fee);
    byKey.set(String(a.code || "").toLowerCase(), fee);
  }
  // aliases comuns
  if (byKey.has("woovi") && !byKey.has("openpix")) {
    byKey.set("openpix", byKey.get("woovi")!);
  }

  const resolveFee = (provider?: string | null, acquirerId?: string | null): Fee => {
    const keys = [
      String(acquirerId || "").toLowerCase(),
      String(provider || "").toLowerCase(),
    ].filter(Boolean);
    for (const k of keys) {
      if (byKey.has(k)) return byKey.get(k)!;
    }
    // fallback: principal (menor priority) — se não achar, zero
    return { feePercent: 0, feeFixed: 0 };
  };

  const costOf = (amount: number, fee: Fee) =>
    round2((amount * fee.feePercent) / 100 + fee.feeFixed);

  const [sales, withdrawals] = await Promise.all([
    prisma.transaction.findMany({
      where: opts.saleWhere,
      select: {
        amount: true,
        provider: true,
        acquirerId: true,
      },
      take: 1000,
    }),
    prisma.withdrawal.findMany({
      where: { status: "pago", date: opts.wdDate },
      select: {
        amount: true,
        provider: true,
      },
      take: 1000,
    }),
  ]);

  let total = 0;
  for (const s of sales) {
    total += costOf(n(s.amount), resolveFee(s.provider, s.acquirerId));
  }
  for (const w of withdrawals) {
    const fee = resolveFee(w.provider, null);
    total += round2(fee.feeFixed);
  }
  return round2(total);
}

/**
 * Volume diário da plataforma no período (America/Sao_Paulo).
 * Usa paidAt das vendas aprovadas (fallback: date).
 */
export async function getAdminVolumeHistory(
  days = 10,
  period?: ChartPeriodKey
): Promise<VolumePoint[] | null> {
  if (!(await dbAvailable())) return null;

  const periodKey: ChartPeriodKey = period || `${days}d`;
  const since = adminPeriodStart(periodKey);
  const until = adminPeriodEnd(periodKey);

  const txs = await prisma.transaction.findMany({
    where: {
      kind: "venda",
      status: "aprovada",
      OR: [
        { paidAt: { gte: since, lte: until } },
        { paidAt: null, date: { gte: since, lte: until } },
      ],
    },
    select: { date: true, paidAt: true, amount: true },
    take: 8000,
  });

  const map = new Map<string, number>();
  for (const t of txs) {
    const when = t.paidAt ?? t.date;
    const d = toISODateInZone(when);
    map.set(d, (map.get(d) ?? 0) + n(t.amount));
  }
  const sparse = [...map.entries()].map(([date, amount]) => ({
    date,
    amount,
  }));

  return fillChartSeries(periodKey, sparse);
}

export async function getAdminLedger(
  limit = 80
): Promise<AdminLedgerRow[] | null> {
  if (!(await dbAvailable())) return null;

  const [txs, wds] = await Promise.all([
    prisma.transaction.findMany({
      orderBy: { date: "desc" },
      take: limit,
    }),
    prisma.withdrawal.findMany({
      orderBy: { date: "desc" },
      take: limit,
    }),
  ]);

  const rows: AdminLedgerRow[] = [
    ...txs.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      userName: t.sellerName ?? t.sellerId,
      kind: "venda" as const,
      direction: (t.direction === "saida" ? "saida" : "entrada") as "entrada" | "saida",
      description: t.description || t.product || "Venda",
      method: t.method,
      amount: n(t.amount),
      status: t.status,
    })),
    ...wds.map((w) => ({
      id: w.id,
      date: w.date.toISOString(),
      userName: w.sellerName,
      kind: "saque" as const,
      direction: "saida" as const,
      description: "Saque",
      method: w.method,
      amount: n(w.amount),
      status: w.status === "pago" ? "pago" : w.status === "recusado" ? "recusado" : "processando",
    })),
  ];

  return rows
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}
