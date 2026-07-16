import { NextResponse } from "next/server";
import type { PodPayWebhookPayload } from "@/lib/acquirers/podpay/types";
import { applyPodPayWebhook } from "@/lib/acquirers/podpay/gateway";
import { verifyPodPaySignature } from "@/lib/server/hmac";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

/**
 * POST /api/v1/webhooks/podpay
 * Público (sem cookie). Valida HMAC se PODPAY_WEBHOOK_SECRET estiver setado.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-podpay-signature") ||
      req.headers.get("x-signature") ||
      req.headers.get("x-hub-signature-256");

    const check = verifyPodPaySignature(
      rawBody,
      signature,
      process.env.PODPAY_WEBHOOK_SECRET
    );
    if (!check.ok) {
      console.warn("[podpay webhook] signature fail", check.reason);
      return NextResponse.json(
        { error: "Assinatura inválida", reason: check.reason },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody) as PodPayWebhookPayload;
    if (!payload?.event || !payload?.data) {
      return NextResponse.json(
        { error: "Payload inválido (event/data obrigatórios)" },
        { status: 400 }
      );
    }

    const result = applyPodPayWebhook(payload);

    // Espelha no MySQL quando possível (venda paga / saque)
    if (isDatabaseConfigured()) {
      try {
        await applyWebhookToMysql(payload);
      } catch (e) {
        console.error("[podpay webhook] mysql mirror", e);
      }
    }

    console.info("[podpay webhook]", result.message, payload.eventId);

    return NextResponse.json({
      success: true,
      message: result.message,
      signature: check.reason ?? "ok",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro no webhook";
    console.error("[podpay webhook error]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function applyWebhookToMysql(payload: PodPayWebhookPayload) {
  const data = payload.data as Record<string, unknown>;
  const remoteId = String(data.id ?? data.transactionId ?? "");
  const event = String(payload.event);

  if (event.startsWith("transaction.") && remoteId) {
    const statusMap: Record<string, string> = {
      "transaction.completed": "aprovada",
      "transaction.failed": "recusada",
      "transaction.pending": "pendente",
      "transaction.refunded": "reembolsada",
    };
    const status = statusMap[event];
    if (!status) return;

    const tx = await prisma.transaction.findFirst({
      where: { providerId: remoteId },
    });
    if (tx) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status,
          paidAt: status === "aprovada" ? new Date() : tx.paidAt,
          refundedAt: status === "reembolsada" ? new Date() : tx.refundedAt,
        },
      });
      if (status === "aprovada" && tx.status !== "aprovada") {
        const amount = Number(tx.amount);
        const fee = Number(tx.feeAmount);
        const net = Math.max(0, amount - fee);
        await prisma.user.update({
          where: { id: tx.sellerId },
          data: {
            balanceAvailable: { increment: net },
            balancePending: { decrement: amount },
            volumeTotal: { increment: amount },
          },
        });
      } else if (
        (status === "recusada" || status === "reembolsada") &&
        tx.status === "pendente"
      ) {
        await prisma.user.update({
          where: { id: tx.sellerId },
          data: {
            balancePending: { decrement: Number(tx.amount) },
          },
        });
      }
    }

    // payment_charges
    await prisma.paymentCharge.updateMany({
      where: { providerId: remoteId },
      data: {
        status:
          status === "aprovada"
            ? "paid"
            : status === "reembolsada"
              ? "refunded"
              : status === "recusada"
                ? "cancelled"
                : "waiting_payment",
        paidAt: status === "aprovada" ? new Date() : undefined,
      },
    });
  }

  if (event.startsWith("withdrawal.") && remoteId) {
    const statusMap: Record<string, string> = {
      "withdrawal.completed": "pago",
      "withdrawal.failed": "recusado",
      "withdrawal.canceled": "recusado",
    };
    const status = statusMap[event];
    if (!status) return;
    await prisma.withdrawal.updateMany({
      where: { providerId: remoteId },
      data: { status, reviewedAt: new Date() },
    });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "podpay",
    path: "/api/v1/webhooks/podpay",
    hmac: !!process.env.PODPAY_WEBHOOK_SECRET,
    events: [
      "transaction.completed",
      "transaction.failed",
      "transaction.pending",
      "transaction.refunded",
      "withdrawal.completed",
      "withdrawal.failed",
      "withdrawal.canceled",
    ],
  });
}
