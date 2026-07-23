import { randomBytes } from "crypto";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

function newId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
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

  // Taxas da conta (Admin → Usuário). 0 é válido; defaults só se inválido.
  const { parseSellerFeePlan } = await import("@/lib/server/seller-fees");
  const plan = parseSellerFeePlan(user);

  return {
    balances: {
      available: n(user.balanceAvailable),
      pending: n(user.balancePending),
      held: n(user.balanceHeld),
    },
    fees: {
      saquePercent: plan.saquePercent,
      saqueFixed: plan.saqueFixed,
      mdrPercent: plan.mdrPercent,
      mdrFixed: plan.mdrFixed,
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

  const { parseSellerFeePlan } = await import("@/lib/server/seller-fees");
  const plan = parseSellerFeePlan(user);
  const feePercent = plan.saquePercent;
  const feeFixed = plan.saqueFixed;
  const feeAmount =
    Math.round(((amount * feePercent) / 100 + feeFixed) * 100) / 100;
  if (feeAmount >= amount) {
    throw new Error("Taxa de saque maior ou igual ao valor");
  }
  const netAmount = Math.round((amount - feeAmount) * 100) / 100;
  const id = newId("sq");

  const created = await prisma.$transaction(async (tx) => {
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
