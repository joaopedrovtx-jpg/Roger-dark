import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

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
      customer: t.customer ?? "-",
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
