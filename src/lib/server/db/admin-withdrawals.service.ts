import { randomBytes } from "crypto";
import { isDatabaseConfigured, prisma } from "@/lib/server/prisma";
import { notifyWithdrawalStatus } from "@/lib/server/notify-email";

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString("base64url")}`;
}

async function dbAvailable(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function audit(
  action: string,
  entityType?: string,
  entityId?: string,
  meta?: unknown
) {
  if (!(await dbAvailable())) return;
  try {
    await prisma.auditLog.create({
      data: {
        id: newId("aud"),
        action,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        meta: meta ? (meta as object) : undefined,
      },
    });
  } catch { /* ignore */ }
}

export async function getAdminSaquesMetrics() {
  if (!(await dbAvailable())) return null;
  const [paid, pending, rejected] = await Promise.all([
    prisma.withdrawal.aggregate({
      where: { status: "pago" },
      _sum: { amount: true, feeAmount: true },
      _count: true,
    }),
    prisma.withdrawal.aggregate({
      where: { status: "processando" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.withdrawal.count({ where: { status: "recusado" } }),
  ]);
  return {
    totalOut: n(paid._sum.amount),
    pendingAmount: n(pending._sum.amount),
    lucroSobreSaque: n(paid._sum.feeAmount),
    paidCount: paid._count,
    pendingCount: pending._count,
    rejectedCount: rejected,
  };
}

export async function listAdminWithdrawals(status?: string) {
  if (!(await dbAvailable())) return null;
  const where = status && status !== "todos" ? { status } : {};
  const statusMap: Record<string, string> = {
    processando: "processando",
    pago: "pago",
    recusado: "recusado",
  };
  const w = status && statusMap[status] ? { status: statusMap[status] } : where;

  const items = await prisma.withdrawal.findMany({
    where: w,
    orderBy: { date: "desc" },
  });
  return items.map((s) => ({
    id: s.id,
    userId: s.sellerId,
    userName: s.sellerName,
    date: s.date.toISOString(),
    amount: n(s.amount),
    method: s.method,
    destination: s.destination,
    status: s.status,
    feePercent: n(s.feePercent),
    feeFixed: n(s.feeFixed),
    feeAmount: n(s.feeAmount),
  }));
}

export async function dbSetWithdrawalStatus(
  id: string,
  status: "pago" | "recusado"
) {
  if (!(await dbAvailable())) return null;
  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w) throw new Error("Saque não encontrado");
  if (w.status !== "processando") {
    throw new Error("Só saques pendentes podem ser atualizados");
  }

  const fee = n(w.feeAmount);

  const updated = await prisma.$transaction(async (tx) => {
    // CAS: só atualiza se ainda estiver processando (evita double-refund)
    const cas = await tx.withdrawal.updateMany({
      where: { id, status: "processando" },
      data: {
        status,
        reviewedAt: new Date(),
      },
    });
    if (cas.count === 0) {
      throw new Error("Saque já foi processado por outra operação");
    }
    const row = await tx.withdrawal.findUniqueOrThrow({ where: { id } });

    if (status === "recusado") {
      await tx.user.update({
        where: { id: w.sellerId },
        data: {
          balanceAvailable: { increment: n(w.amount) },
        },
      });
      const user = await tx.user.findUnique({
        where: { id: w.sellerId },
        select: { balanceAvailable: true },
      });
      await tx.balanceLedger.create({
        data: {
          id: newId("led"),
          userId: w.sellerId,
          type: "withdrawal_refund",
          amount: n(w.amount),
          bucket: "available",
          balanceAfter: n(user?.balanceAvailable),
          referenceType: "withdrawal",
          referenceId: id,
          description: "Saque recusado valor devolvido",
        },
      });
    }

    if (status === "pago" && fee > 0) {
      await tx.user.update({
        where: { id: w.sellerId },
        data: {
          platformProfit: { increment: fee },
        },
      });
    }

    await tx.transaction.create({
      data: {
        id: newId("txs"),
        date: new Date(),
        sellerId: w.sellerId,
        sellerName: w.sellerName,
        kind: "saque",
        direction: "saida",
        description:
          status === "pago"
            ? `Saque PIX aprovado → ${w.destination}`
            : `Saque PIX recusado`,
        method: "PIX",
        amount: n(w.amount),
        feeAmount: fee,
        netAmount: n(w.netAmount),
        platformFee: status === "pago" ? fee : 0,
        status: status === "pago" ? "pago" : "recusado",
        provider: "darkpay",
        providerId: id,
      },
    });

    return row;
  });

  await audit(`withdrawal.${status}`, "withdrawal", id);
  notifyWithdrawalStatus(w.sellerId, n(w.amount), status, w.destination).catch(() => {});
  return {
    id: updated.id,
    sellerId: updated.sellerId,
    sellerName: updated.sellerName,
    date: updated.date.toISOString(),
    amount: n(updated.amount),
    method: updated.method,
    destination: updated.destination,
    status: updated.status as "pago" | "recusado" | "processando",
    feePercent: n(updated.feePercent),
    feeFixed: n(updated.feeFixed),
    feeAmount: fee,
  };
}
