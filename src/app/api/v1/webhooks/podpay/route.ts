import { NextResponse } from "next/server";
import type { PodPayWebhookPayload } from "@/lib/acquirers/podpay/types";
import { applyPodPayWebhook } from "@/lib/acquirers/podpay/gateway";
import { verifyPodPaySignature } from "@/lib/server/hmac";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { creditPaidSaleIdempotent } from "@/lib/server/balance";

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

    // Memória síncrona leve; MySQL em fila inline (atômico com a resposta).
    const result = applyPodPayWebhook(payload);

    // Outbox: grava o evento bruto antes de aplicar. Se o apply falhar,
    // o evento fica registrado em audit_logs (status=pending) e pode
    // ser reprocessado manualmente.
    const data = payload.data as Record<string, unknown>;
    const remoteId = String(data.id ?? data.transactionId ?? "");
    const { recordInbox, markInbox } = await import("@/lib/server/webhook-inbox");
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
        // O worker atual roda inline no mesmo processo. Await é obrigatório:
        // sem ele a resposta 200 volta à adquirente ANTES do apply rodar,
        // e um restart nesse meio tempo perde o evento. Em produção, trocar
        // por worker durável (Redis/SQS + outbox).
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
    log.info({ message: result.message, event: String(payload.event || ""), queued: true }, "podpay_webhook");

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
      where: { providerId: remoteId },
    });

    if (status === "aprovada" && tx) {
      // Crédito idempotente: só aplica se TX ainda pendente
      await creditPaidSaleIdempotent({
        transactionId: tx.id,
        providerId: remoteId,
        provider: "podpay",
        sellerId: tx.sellerId,
        amount: Number(tx.amount),
        feeAmount: Number(tx.feeAmount),
      });
    } else if (tx) {
      await prisma.transaction.updateMany({
        where: { id: tx.id, status: "pendente" },
        data: {
          status,
          refundedAt: status === "reembolsada" ? new Date() : undefined,
        },
      });
      if (
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
      await prisma.paymentCharge.updateMany({
        where: { providerId: remoteId },
        data: {
          status:
            status === "reembolsada"
              ? "refunded"
              : status === "recusada"
                ? "cancelled"
                : "waiting_payment",
        },
      });
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
