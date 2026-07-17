/**
 * Seller — dashboard, financeiro, transações, saque (MySQL).
 */
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

  // Agregações SQL — não carrega todas as TXs do período
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
      // série diária: só amount+date das pagas (limitado)
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

export async function getSellerFinance(sellerId: string) {
  if (!(await dbOk())) return null;
  const user = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!user) return null;
  const withdrawals = await prisma.withdrawal.findMany({
    where: { sellerId },
    orderBy: { date: "desc" },
    take: 100,
  });
  const totalOut = withdrawals
    .filter((w) => w.status === "pago")
    .reduce((a, w) => a + n(w.amount), 0);

  const saquePercent = n(user.saquePercent) > 0 ? n(user.saquePercent) : 3;
  const saqueFixed = n(user.saqueFixed);
  const mdrPercent = n(user.mdrPercent) > 0 ? n(user.mdrPercent) : 3;
  const mdrFixed = n(user.mdrFixed) || 0.15;

  return {
    balances: {
      available: n(user.balanceAvailable),
      pending: n(user.balancePending),
      held: n(user.balanceHeld),
    },
    fees: {
      saquePercent,
      saqueFixed,
      mdrPercent,
      mdrFixed,
    },
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      sellerId: w.sellerId,
      sellerName: w.sellerName,
      date: w.date.toISOString(),
      amount: n(w.amount),
      method: w.method,
      destination: w.destination,
      status: w.status,
      feePercent: n(w.feePercent),
      feeFixed: n(w.feeFixed),
      feeAmount: n(w.feeAmount),
    })),
    totalOut,
    sellerName: user.name,
  };
}

export async function listSellerTransactions(
  sellerId: string,
  opts?: { page?: number; pageSize?: number; status?: string }
) {
  if (!(await dbOk())) return null;
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 40;
  const where: { sellerId: string; status?: string; kind?: string } = {
    sellerId,
    kind: "venda",
  };
  if (opts?.status) where.status = opts.status;

  const baseWhere = { sellerId, kind: "venda" as const };

  const [total, items, pendentes, pagos, recusados, reembolsos, totalAll] =
    await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.transaction.aggregate({
        where: { ...baseWhere, status: "pendente" },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { ...baseWhere, status: "aprovada" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { ...baseWhere, status: "recusada" },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { ...baseWhere, status: "reembolsada" },
        _sum: { amount: true },
      }),
      prisma.transaction.count({ where: baseWhere }),
    ]);

  const paidCount = pagos._count;
  const paidSum = n(pagos._sum.amount);
  const metrics = {
    /** Totais em R$ (não quantidade) */
    pendentes: n(pendentes._sum.amount),
    pagos: paidSum,
    recusados: n(recusados._sum.amount),
    reembolsos: n(reembolsos._sum.amount),
    ticketMedio: paidCount > 0 ? paidSum / paidCount : 0,
    taxaConversao:
      totalAll > 0 ? Math.round((paidCount / totalAll) * 1000) / 10 : 0,
  };

  return {
    metrics,
    items: items.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      customer: t.customer ?? "—",
      product: t.product ?? t.description,
      method: "PIX" as const,
      amount: n(t.amount),
      status: t.status,
    })),
    total,
    page,
    pageSize,
  };
}

function newId(prefix: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

/** Solicita saque no MySQL (debita disponível) */
export async function createSellerWithdrawalDb(
  sellerId: string,
  sellerName: string,
  amount: number,
  pixKey: string
) {
  if (!(await dbOk())) return null;
  if (amount < 5) throw new Error("Saque mínimo: R$ 5,00");
  if (!pixKey.trim()) throw new Error("Chave PIX obrigatória");

  const user = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!user) throw new Error("Seller não encontrado");
  if (user.status === "bloqueado") {
    throw new Error("Conta bloqueada. Fale com o suporte.");
  }
  if (user.status === "pendente") {
    throw new Error(
      "Conta pendente de aprovação. Complete o cadastro e aguarde a análise."
    );
  }

  // Taxas do seller (admin configura); default 3% se zerado no cadastro
  const feePercent = n(user.saquePercent) > 0 ? n(user.saquePercent) : 3;
  const feeFixed = n(user.saqueFixed);
  const feeAmount =
    Math.round(((amount * feePercent) / 100 + feeFixed) * 100) / 100;
  if (feeAmount >= amount) {
    throw new Error("Taxa de saque maior ou igual ao valor");
  }
  const netAmount = Math.round((amount - feeAmount) * 100) / 100;
  const id = `SQ-${Date.now().toString().slice(-8)}`;

  const created = await prisma.$transaction(async (tx) => {
    // Debito atômico: só se ainda houver saldo suficiente
    const debited = await tx.user.updateMany({
      where: {
        id: sellerId,
        balanceAvailable: { gte: amount },
      },
      data: { balanceAvailable: { decrement: amount } },
    });
    if (debited.count === 0) {
      throw new Error("Saldo insuficiente");
    }
    const after = await tx.user.findUnique({
      where: { id: sellerId },
      select: { balanceAvailable: true },
    });
    const w = await tx.withdrawal.create({
      data: {
        id,
        sellerId,
        sellerName,
        amount,
        feePercent,
        feeFixed,
        feeAmount,
        netAmount,
        method: "PIX",
        destination: pixKey.trim(),
        status: "processando",
      },
    });
    await tx.balanceLedger.create({
      data: {
        id: newId("led"),
        userId: sellerId,
        type: "withdrawal",
        amount: -amount,
        bucket: "available",
        balanceAfter: n(after?.balanceAvailable),
        referenceType: "withdrawal",
        referenceId: id,
        description: "Solicitação de saque",
      },
    });
    return w;
  });

  return {
    id: created.id,
    sellerId: created.sellerId,
    sellerName: created.sellerName,
    date: created.date.toISOString(),
    amount: n(created.amount),
    method: created.method,
    destination: created.destination,
    status: created.status as "processando",
    feePercent: n(created.feePercent),
    feeFixed: n(created.feeFixed),
  };
}
