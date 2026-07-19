import type { AdminMetrics } from "@/lib/domain/types";
import { isDatabaseConfigured, prisma } from "@/lib/server/prisma";

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

export async function getAdminDashboardMetrics(): Promise<AdminMetrics | null> {
  if (!(await dbAvailable())) return null;

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
      where: { kind: "venda", status: "aprovada" },
      _sum: { amount: true, platformFee: true },
      _count: true,
    }),
    prisma.transaction.count({
      where: {
        kind: "venda",
        status: { in: ["aprovada", "recusada", "reembolsada"] },
      },
    }),
    prisma.transaction.count({ where: { kind: "venda" } }),
    prisma.withdrawal.aggregate({
      where: { status: "pago" },
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
    activeAdquirentes: acquirersActive,
    totalTransactions: totalSalesCount,
    averageTicket,
    totalHeldBalance: n(balAgg._sum.balanceHeld),
    totalAvailableBalance: n(balAgg._sum.balanceAvailable),
    totalPendingBalance: n(balAgg._sum.balancePending),
    conversionRate: Math.round(conversionRate * 10) / 10,
  };
}

export async function getAdminVolumeHistory(
  days = 10
): Promise<VolumePoint[] | null> {
  if (!(await dbAvailable())) return null;

  const rows = await prisma.metricDaily.findMany({
    where: { scope: "platform" },
    orderBy: { date: "desc" },
    take: days,
  });

  if (rows.length > 0) {
    return rows
      .map((r) => ({
        date:
          r.date instanceof Date
            ? r.date.toISOString().slice(0, 10)
            : String(r.date).slice(0, 10),
        amount: n(r.volumeGross),
        grain: "day" as const,
      }))
      .reverse();
  }

  try {
    const since = new Date(Date.now() - days * 864e5);
    const isMysql = (process.env.DATABASE_URL || "").startsWith("mysql");
    const rows = isMysql
      ? await prisma.$queryRaw<Array<{ d: Date | string; total: unknown }>>`
          SELECT DATE(\`date\`) AS d, SUM(amount) AS total
          FROM \`transactions\`
          WHERE kind = 'venda' AND status = 'aprovada' AND \`date\` >= ${since}
          GROUP BY DATE(\`date\`)
          ORDER BY d ASC
        `
      : await prisma.$queryRaw<Array<{ d: string; total: unknown }>>`
          SELECT date(date) AS d, SUM(amount) AS total
          FROM transactions
          WHERE kind = 'venda' AND status = 'aprovada' AND date >= ${since}
          GROUP BY date(date)
          ORDER BY d ASC
        `;

    return rows.map((r) => ({
      date:
        r.d instanceof Date
          ? r.d.toISOString().slice(0, 10)
          : String(r.d).slice(0, 10),
      amount: n(r.total),
      grain: "day" as const,
    }));
  } catch {
    const txs = await prisma.transaction.findMany({
      where: {
        kind: "venda",
        status: "aprovada",
        date: { gte: new Date(Date.now() - days * 864e5) },
      },
      select: { date: true, amount: true },
      take: 2000,
    });
    const map = new Map<string, number>();
    for (const t of txs) {
      const d =
        t.date instanceof Date
          ? t.date.toISOString().slice(0, 10)
          : String(t.date).slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + n(t.amount));
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, amount]) => ({ date, amount, grain: "day" as const }));
  }
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
