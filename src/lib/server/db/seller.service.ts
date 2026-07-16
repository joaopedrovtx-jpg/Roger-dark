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

  const txs = await prisma.transaction.findMany({
    where: {
      sellerId,
      kind: "venda",
      date: { gte: from, lte: to },
    },
  });

  const paid = txs.filter((t) => t.status === "aprovada");
  const volume = paid.reduce((a, t) => a + n(t.amount), 0);
  const sellerProfit = paid.reduce((a, t) => a + n(t.netAmount), 0);
  const outflows = await prisma.withdrawal.findMany({
    where: {
      sellerId,
      status: "pago",
      date: { gte: from, lte: to },
    },
  });
  const totalOut = outflows.reduce((a, w) => a + n(w.amount), 0);

  const decided = txs.filter((t) =>
    ["aprovada", "recusada", "reembolsada"].includes(t.status)
  );
  const conversionRate =
    decided.length > 0 ? (paid.length / decided.length) * 100 : 0;

  // série diária
  const byDay = new Map<string, number>();
  for (const t of paid) {
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
      transactionCount: txs.length,
      averageTicket: paid.length ? volume / paid.length : 0,
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

  const [total, items] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const all = await prisma.transaction.findMany({
    where: { sellerId, kind: "venda" },
    select: { status: true, amount: true },
  });
  const paid = all.filter((t) => t.status === "aprovada");
  const metrics = {
    pendentes: all.filter((t) => t.status === "pendente").length,
    pagos: paid.length,
    recusados: all.filter((t) => t.status === "recusada").length,
    reembolsos: all.filter((t) => t.status === "reembolsada").length,
    ticketMedio:
      paid.length > 0
        ? paid.reduce((a, t) => a + n(t.amount), 0) / paid.length
        : 0,
    taxaConversao:
      all.length > 0
        ? Math.round((paid.length / all.length) * 1000) / 10
        : 0,
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
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
  const available = n(user.balanceAvailable);
  if (amount > available) throw new Error("Saldo insuficiente");

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
    await tx.user.update({
      where: { id: sellerId },
      data: { balanceAvailable: { decrement: amount } },
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
        balanceAfter: available - amount,
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
