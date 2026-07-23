import { NextResponse } from "next/server";
import type { PodPayWebhookPayload } from "@/lib/acquirers/podpay/types";
import { applyPodPayWebhook } from "@/lib/acquirers/podpay/gateway";
import { verifyPodPaySignature } from "@/lib/server/hmac";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import {
  creditPaidSaleIdempotent,
  refundSaleIdempotent,
  rejectPendingSaleIdempotent,
} from "@/lib/server/balance";

/**
 * POST /api/v1/webhooks/podpay
 * Público. Em produção, HMAC é OBRIGATÓRIO (PODPAY_WEBHOOK_SECRET).
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-podpay-signature");
    if (!signature) {
      return NextResponse.json(
        { error: "Assinatura ausente", reason: "missing_signature" },
        { status: 401 }
      );
    }

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

    const data = payload.data as Record<string, unknown>;
    const remoteId = String(data.id ?? data.transactionId ?? "");
    const { recordInbox, markInbox } = await import(
      "@/lib/server/webhook-inbox"
    );
    const inbox = await recordInbox({
      provider: "podpay",
      eventId: payload.eventId,
      eventName: String(payload.event || ""),
      remoteId: remoteId || undefined,
      payload,
    });

    if (isDatabaseConfigured()) {
      try {
        const { enqueueWebhookJob } = await import(
          "@/lib/server/webhook-queue"
        );
        await enqueueWebhookJob("podpay", async () => {
          await applyWebhookToMysql(payload);
        });
        if (inbox.created) await markInbox(inbox.inboxId, "applied");
      } catch (applyErr) {
        if (inbox.created) {
          await markInbox(
            inbox.inboxId,
            "failed",
            applyErr instanceof Error ? applyErr.message : String(applyErr)
          );
        }
        throw applyErr;
      }
    }

    const { log } = await import("@/lib/server/logger");
    log.info(
      {
        message: result.message,
        event: String(payload.event || ""),
        queued: true,
      },
      "podpay_webhook"
    );

    return NextResponse.json({
      success: true,
      message: result.message,
      signature: check.reason ?? "ok",
      queued: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro no webhook";
    const { log } = await import("@/lib/server/logger");
    log.error({ error: msg }, "podpay_webhook_error");
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
      where: {
        OR: [
          { providerId: remoteId, provider: "podpay" },
          { providerId: remoteId },
        ],
      },
    });
    if (!tx) return;

    if (status === "aprovada") {
      const { notifyUtmifyAfterPaid } = await import("@/lib/server/balance");
      const credit = await creditPaidSaleIdempotent({
        transactionId: tx.id,
        providerId: remoteId,
        provider: "podpay",
        sellerId: tx.sellerId,
        amount: Number(tx.amount),
        feeAmount: Number(tx.feeAmount),
      });
      if (credit.credited) {
        await notifyUtmifyAfterPaid({
          sellerId: tx.sellerId,
          orderId: tx.id,
          amount: Number(tx.amount),
          feeAmount: Number(tx.feeAmount),
          description: tx.description,
          customerName: tx.customer,
          customerEmail: tx.customerEmail,
          customerDocument: tx.customerDocument,
          createdAt: tx.createdAt,
        });
      }
      return;
    }

    if (status === "recusada") {
      await rejectPendingSaleIdempotent({
        transactionId: tx.id,
        sellerId: tx.sellerId,
        amount: Number(tx.amount),
        providerId: remoteId,
        chargeStatus: "cancelled",
      });
      return;
    }

    if (status === "reembolsada") {
      await refundSaleIdempotent({
        transactionId: tx.id,
        sellerId: tx.sellerId,
        amount: Number(tx.amount),
        feeAmount: Number(tx.feeAmount),
        netAmount: Number(tx.netAmount),
        providerId: remoteId,
      });
      return;
    }
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
  return NextResponse.json({ ok: true }, { status: 200 });
}
