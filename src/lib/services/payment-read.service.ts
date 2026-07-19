import type { PaymentCharge } from "@/lib/server/memory-store";
import { getStore } from "@/lib/server/memory-store";

export function getCharge(id: string): PaymentCharge | null {
  return getStore().charges.find((c) => c.id === id) ?? null;
}

export async function getChargeAsync(
  id: string,
  sellerId?: string
): Promise<PaymentCharge | null> {
  const local = getCharge(id);
  if (local) return local;

  try {
    const { prisma, isDatabaseConfigured } = await import("@/lib/server/prisma");
    if (!isDatabaseConfigured()) return null;
    const row = await prisma.paymentCharge.findFirst({
      where: {
        OR: [{ id }, { providerId: id }],
        ...(sellerId ? { sellerId } : {}),
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      sellerId: row.sellerId,
      amount: Number(row.amount),
      currency: "BRL",
      status: row.status as PaymentCharge["status"],
      method: "PIX",
      description: row.description ?? undefined,
      customerName: row.customerName ?? undefined,
      customerDocument: row.customerDocument ?? undefined,
      pixQrCode: row.pixQrCode ?? undefined,
      pixCopyPaste: row.pixCopyPaste ?? undefined,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      paidAt: row.paidAt?.toISOString(),
      transactionId: row.transactionId ?? undefined,
    };
  } catch {
    return null;
  }
}

export function listCharges(sellerId?: string): PaymentCharge[] {
  const all = getStore().charges;
  if (!sellerId) return all;
  return all.filter((c) => c.sellerId === sellerId);
}

export async function listChargesAsync(
  sellerId: string
): Promise<PaymentCharge[]> {
  const local = listCharges(sellerId);
  try {
    const { prisma, isDatabaseConfigured } = await import("@/lib/server/prisma");
    if (!isDatabaseConfigured()) return local;
    const rows = await prisma.paymentCharge.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const mapped: PaymentCharge[] = rows.map((row) => ({
      id: row.id,
      sellerId: row.sellerId,
      amount: Number(row.amount),
      currency: "BRL" as const,
      status: row.status as PaymentCharge["status"],
      method: "PIX" as const,
      description: row.description ?? undefined,
      customerName: row.customerName ?? undefined,
      customerDocument: row.customerDocument ?? undefined,
      pixQrCode: row.pixQrCode ?? undefined,
      pixCopyPaste: row.pixCopyPaste ?? undefined,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      paidAt: row.paidAt?.toISOString(),
      transactionId: row.transactionId ?? undefined,
    }));
    const map = new Map<string, PaymentCharge>();
    for (const c of [...mapped, ...local]) map.set(c.id, c);
    return [...map.values()].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return local;
  }
}

export function mapPaymentStatus(s: string): string {
  return s;
}
