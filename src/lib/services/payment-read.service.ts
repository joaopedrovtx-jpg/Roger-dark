import type { PaymentCharge } from "@/lib/server/memory-store";
import { getStore } from "@/lib/server/memory-store";

/**
 * Busca uma cobrança em memória. Se `sellerId` for fornecido, restringe a
 * busca ao seller — evita que um seller que saiba o ID de cobrança de outro
 * consiga vê-la (a fonte canônica continua sendo o DB via getChargeAsync).
 */
export function getCharge(
  id: string,
  sellerId?: string
): PaymentCharge | null {
  const all = getStore().charges;
  const found = all.find((c) => c.id === id);
  if (!found) return null;
  if (sellerId && found.sellerId !== sellerId) return null;
  return found;
}

export async function getChargeAsync(
  id: string,
  sellerId: string
): Promise<PaymentCharge | null> {
  const local = getCharge(id, sellerId);
  if (local) return local;

  try {
    const { prisma, isDatabaseConfigured } = await import("@/lib/server/prisma");
    if (!isDatabaseConfigured()) return null;
    const row = await prisma.paymentCharge.findFirst({
      where: {
        OR: [{ id }, { providerId: id }],
        sellerId,
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
