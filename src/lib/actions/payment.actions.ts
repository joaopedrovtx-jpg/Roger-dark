"use server";

import { getSessionUser } from "@/lib/server/auth";
import { createPixCharge } from "@/lib/services/payment-write.service";
import { markChargePaid } from "@/lib/services/payment-write.service";
import { isMockAllowed } from "@/lib/server/security";

export async function createPixChargeAction(data: {
  amount: number;
  description?: string;
  customerName?: string;
  customerDocument?: string;
  customerEmail?: string;
  customerPhone?: string;
  metadata?: Record<string, string>;
}) {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado" };

  if (!data.amount || data.amount < 1) {
    return { error: "Valor mínimo: R$ 1,00" };
  }

  try {
    const charge = await createPixCharge({
      sellerId: user.id,
      amount: data.amount,
      description: data.description,
      customerName: data.customerName || user.name,
      customerDocument: data.customerDocument,
      customerEmail: data.customerEmail || user.email,
      customerPhone: data.customerPhone,
      metadata: data.metadata,
    });

    return {
      id: charge.id,
      status: charge.status,
      amount: charge.amount,
      currency: charge.currency,
      method: charge.method,
      provider: charge.provider,
      pix: {
        qrCode: charge.pixQrCode,
        copyPaste: charge.pixCopyPaste,
      },
      expiresAt: charge.expiresAt,
      createdAt: charge.createdAt,
      transactionId: charge.transactionId,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao criar cobrança" };
  }
}

export async function simulatePayAction(chargeId: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado" };

  if (!isMockAllowed()) {
    return { error: "Simulação desativada em produção." };
  }

  try {
    const { getChargeAsync } = await import("@/lib/services/payment-read.service");
    const existing = await getChargeAsync(chargeId);
    if (!existing) return { error: "Cobrança não encontrada" };
    if (existing.sellerId !== user.id && !user.roles.includes("admin")) {
      return { error: "Sem permissão para esta cobrança" };
    }

    const charge = await markChargePaid(chargeId);
    return {
      id: charge.id,
      status: charge.status,
      paidAt: charge.paidAt,
      transactionId: charge.transactionId,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao simular pagamento" };
  }
}
