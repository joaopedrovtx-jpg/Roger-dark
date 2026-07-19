import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import type { PeriodKey, SellerDashboard } from "@/lib/domain/types";

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

async function dbOk() {
  if (!isDatabaseConfigured()) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function periodStart(period: PeriodKey): Date {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case "today":
      d.setHours(0, 0, 0, 0);
      return d;
    case "yesterday": {
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "7d":
      d.setDate(d.getDate() - 7);
      return d;
    case "15d":
      d.setDate(d.getDate() - 15);
      return d;
    case "30d":
      d.setDate(d.getDate() - 30);
      return d;
    case "60d":
      d.setDate(d.getDate() - 60);
      return d;
    default:
      d.setDate(d.getDate() - 7);
      return d;
  }
}

export async function getSellerDashboard(
  sellerId: string,
  period: PeriodKey = "7d"
): Promise<SellerDashboard | null> {
  if (!(await dbOk())) return null;

  const user = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!user) return null;

  const from = periodStart(period);
  const to = new Date();
  if (period === "yesterday") {
    to.setHours(0, 0, 0, 0);
  }

  const saleWhere = {
    sellerId,
    kind: "venda" as const,
    date: { gte: from, lte: to },
  };

  const [paidAgg, totalCount, decidedCount, totalOutAgg, paidForSeries] =
    await Promise.all([
      prisma.transaction.aggregate({
        where: { ...saleWhere, status: "aprovada" },
        _sum: { amount: true, netAmount: true },
        _count: true,
      }),
      prisma.transaction.count({ where: saleWhere }),
      prisma.transaction.count({
        where: {
          ...saleWhere,
          status: { in: ["aprovada", "recusada", "reembolsada"] },
        },
      }),
      prisma.withdrawal.aggregate({
        where: {
          sellerId,
          status: "pago",
          date: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.findMany({
        where: { ...saleWhere, status: "aprovada" },
        select: { date: true, amount: true },
        orderBy: { date: "asc" },
        take: 2000,
      }),
    ]);

  const volume = n(paidAgg._sum.amount);
  const sellerProfit = n(paidAgg._sum.netAmount);
  const paidCount = paidAgg._count;
  const totalOut = n(totalOutAgg._sum.amount);
  const conversionRate =
    decidedCount > 0 ? (paidCount / decidedCount) * 100 : 0;

  const byDay = new Map<string, number>();
  for (const t of paidForSeries) {
    const key = t.date.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + n(t.amount));
  }
  const revenueHistory = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, amount]) => ({
      date,
      amount,
      grain: "day" as const,
    }));

  return {
    user: {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
    },
    balances: {
      available: n(user.balanceAvailable),
      pending: n(user.balancePending),
      held: n(user.balanceHeld),
    },
    metrics: {
      netProfit: sellerProfit || n(user.platformProfit),
      transactionCount: totalCount,
      averageTicket: paidCount ? volume / paidCount : 0,
      totalOut,
    },
    conversionRate: Math.round(conversionRate * 10) / 10,
    revenueHistory,
    volumeGoal: {
      current: volume,
      target: Math.max(volume * 1.1, 1000),
    },
  };
}
