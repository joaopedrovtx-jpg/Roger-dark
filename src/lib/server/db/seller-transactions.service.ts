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

/**
 * Total de reembolsos do seller (vendas status=reembolsada).
 * Fonte única usada em Dashboard e página Transações.
 */
export async function sumSellerRefunds(sellerId: string): Promise<number> {
  if (!(await dbOk())) return 0;
  const reembolsos = await prisma.transaction.aggregate({
    where: { sellerId, kind: "venda", status: "reembolsada" },
    _sum: { amount: true },
  });
  return n(reembolsos._sum.amount);
}

export async function listSellerTransactions(
  sellerId: string,
  opts?: { page?: number; pageSize?: number; status?: string }
) {
  if (!(await dbOk())) return null;
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = opts?.pageSize ?? 40;
  const where: { sellerId: string; status?: string; kind?: string } = {
    sellerId,
    kind: "venda",
  };
  if (opts?.status) where.status = opts.status;

  const baseWhere = { sellerId, kind: "venda" as const };

  const [total, items, pendentes, pagos, recusados, reembolsosTotal, totalAll] =
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
        where: {
          ...baseWhere,
          status: { in: ["recusada", "abandonada"] },
        },
        _sum: { amount: true },
      }),
      sumSellerRefunds(sellerId),
      prisma.transaction.count({ where: baseWhere }),
    ]);

  const paidCount = pagos._count;
  const paidSum = n(pagos._sum.amount);
  const metrics = {
    pendentes: n(pendentes._sum.amount),
    pagos: paidSum,
    recusados: n(recusados._sum.amount),
    // Mesma fonte do KPI "Reembolso" no dashboard
    reembolsos: reembolsosTotal,
    ticketMedio: paidCount > 0 ? paidSum / paidCount : 0,
    taxaConversao:
      totalAll > 0 ? Math.round((paidCount / totalAll) * 1000) / 10 : 0,
  };

  return {
    metrics,
    items: items.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      customer: t.customer ?? " ",
      product: t.product ?? t.description,
      method: "PIX" as const,
      amount: n(t.amount),
      status: t.status,
      kind: "venda" as const,
      // aliases p/ anti-duplicata de notificação (poll ↔ charge id)
      providerId: t.providerId ?? undefined,
    })),
    total,
    page,
    pageSize,
  };
}
