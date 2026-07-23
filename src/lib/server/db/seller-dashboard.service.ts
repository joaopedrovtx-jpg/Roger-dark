import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import type { PeriodKey, SellerDashboard } from "@/lib/domain/types";
import {
  chartBucketKey,
  daysForPeriod,
  fillChartSeries,
  type ChartGrain,
} from "@/lib/chart-series";
import { endOfZonedDay, startOfZonedDay } from "@/lib/timezone";

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

/**
 * Janela do período em America/Sao_Paulo (alinhada ao gráfico).
 * Vendas pagas usam paidAt (fallback date) para bater com o dia do recebimento.
 */
function periodWindow(period: PeriodKey): {
  from: Date;
  to: Date;
  grain: ChartGrain;
} {
  if (period === "today") {
    return {
      from: startOfZonedDay(0),
      to: endOfZonedDay(0),
      grain: "hour",
    };
  }
  if (period === "yesterday") {
    return {
      from: startOfZonedDay(1),
      to: endOfZonedDay(1),
      grain: "hour",
    };
  }
  const days = daysForPeriod(period);
  // N dias incluindo hoje → início = meia-noite de (N-1) dias atrás
  return {
    from: startOfZonedDay(days - 1),
    to: endOfZonedDay(0),
    grain: "day",
  };
}

export async function getSellerDashboard(
  sellerId: string,
  period: PeriodKey = "7d"
): Promise<SellerDashboard | null> {
  if (!(await dbOk())) return null;

  const user = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!user) return null;

  const { from, to, grain } = periodWindow(period);

  // Métricas e gráfico: vendas pagas cujo instante de pagamento (ou criação)
  // cai no período em SP.
  const paidInPeriod = await prisma.transaction.findMany({
    where: {
      sellerId,
      kind: "venda",
      status: "aprovada",
      OR: [
        { paidAt: { gte: from, lte: to } },
        // legado: pago sem paidAt → usa date
        { paidAt: null, date: { gte: from, lte: to } },
      ],
    },
    select: {
      date: true,
      paidAt: true,
      amount: true,
      netAmount: true,
    },
    orderBy: { date: "asc" },
    take: 5000,
  });

  // Contagens do período (todas as vendas criadas no range) para conversão
  const saleWhereCreated = {
    sellerId,
    kind: "venda" as const,
    date: { gte: from, lte: to },
  };

  const [totalCount, decidedCount, totalOutAgg] = await Promise.all([
    prisma.transaction.count({ where: saleWhereCreated }),
    prisma.transaction.count({
      where: {
        ...saleWhereCreated,
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
  ]);

  let volume = 0;
  let sellerProfit = 0;
  const byBucket = new Map<string, number>();

  for (const t of paidInPeriod) {
    const when = t.paidAt ?? t.date;
    volume += n(t.amount);
    sellerProfit += n(t.netAmount);
    const key = chartBucketKey(when, grain);
    byBucket.set(key, (byBucket.get(key) ?? 0) + n(t.amount));
  }

  const paidCount = paidInPeriod.length;
  const totalOut = n(totalOutAgg._sum.amount);
  const conversionRate =
    decidedCount > 0 ? (paidCount / decidedCount) * 100 : 0;

  const sparse = [...byBucket.entries()].map(([date, amount]) => ({
    date,
    amount,
  }));
  const revenueHistory = fillChartSeries(period, sparse);

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
      netProfit: sellerProfit,
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
