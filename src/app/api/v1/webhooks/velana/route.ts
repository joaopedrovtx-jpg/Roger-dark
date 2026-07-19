import { NextResponse } from "next/server";
import type { VelanaPostbackPayload } from "@/lib/acquirers/velana/types";
import { applyVelanaWebhook } from "@/lib/acquirers/velana/gateway";
import {
  mapVelanaTxStatus,
  mapVelanaTransferStatus,
} from "@/lib/acquirers/velana/mappers";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { creditPaidSaleIdempotent } from "@/lib/server/balance";
import { verifyVelanaWebhook } from "@/lib/server/hmac";

/**
 * POST /api/v1/webhooks/velana
 * Público. Postbacks oficiais:
 * https://velana.readme.io/reference/formato-dos-postbacks
 *
 * Formatos:
 *  { type: "transaction", objectId, data: { id, status, ... } }
 *  { type: "checkout", data: { transaction: { ... } } }
 *  { type: "transfer", data: { id, status, ... } }
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-velana-signature") ||
      req.headers.get("x-signature") ||
      req.headers.get("x-hub-signature-256");
    const sigCheck = verifyVelanaWebhook(
      rawBody,
      signature,
      process.env.VELANA_WEBHOOK_SECRET
    );
    if (!sigCheck.ok) {
      return NextResponse.json(
        { error: "Assinatura inválida", reason: sigCheck.reason },
        { status: 401 }
      );
    }

    let payload: VelanaPostbackPayload;
    try {
      payload = JSON.parse(rawBody) as VelanaPostbackPayload;
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    payload = normalizePayload(payload);

    if (!payload?.data) {
      return NextResponse.json(
        { error: "Payload inválido (data esperado)" },
        { status: 400 }
      );
    }

    const result = applyVelanaWebhook(payload);

    if (isDatabaseConfigured()) {
      const { enqueueWebhookJob } = await import(
        "@/lib/server/webhook-queue"
      );
      enqueueWebhookJob("velana", async () => {
        await applyWebhookToMysql(payload);
      });
    }

    const { log } = await import("@/lib/server/logger");
    log.info({ message: result.message, type: String(payload.type || ""), queued: true }, "velana_webhook");

    return NextResponse.json({
      success: true,
      message: result.message,
      queued: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro no webhook";
    const { log } = await import("@/lib/server/logger");
    log.error({ error: msg }, "velana_webhook_error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function normalizePayload(payload: VelanaPostbackPayload): VelanaPostbackPayload {
  // Objeto transaction solto
  if (!payload.type && payload.data) {
    return { type: "transaction", data: payload.data };
  }
  const asAny = payload as unknown as Record<string, unknown>;
  if (!payload.data && asAny.status != null) {
    return {
      type: "transaction",
      objectId: String(asAny.id ?? ""),
      data: asAny,
    };
  }
  // type ausente mas tem data.id + data.status
  if (!payload.type && payload.data?.status != null) {
    return { ...payload, type: "transaction" };
  }
  return payload;
}

async function applyWebhookToMysql(payload: VelanaPostbackPayload) {
  const type = String(payload.type || "").toLowerCase();
  let data = (payload.data || {}) as Record<string, unknown>;

  if (type === "checkout" && data.transaction) {
    data = data.transaction as Record<string, unknown>;
  }

  const remoteId = String(data.id ?? payload.objectId ?? "").trim();
  if (!remoteId) return;

  // ── Transação / checkout ──────────────────────────────
  if (
    type === "transaction" ||
    type === "checkout" ||
    (data.status != null && type !== "transfer")
  ) {
    const mapped = mapVelanaTxStatus(String(data.status || ""));
    const statusTx =
      mapped === "aprovada"
        ? "aprovada"
        : mapped === "reembolsada"
          ? "reembolsada"
          : mapped === "recusada"
            ? "recusada"
            : "pendente";
    const statusCharge =
      statusTx === "aprovada"
        ? "paid"
        : statusTx === "reembolsada"
          ? "refunded"
          : statusTx === "recusada"
            ? "cancelled"
            : "waiting_payment";

    const tx = await prisma.transaction.findFirst({
      where: {
        OR: [
          { providerId: remoteId, provider: "velana" },
          { providerId: remoteId },
          { id: `TX-VL-${remoteId}` },
        ],
      },
    });

    if (statusTx === "aprovada" && tx) {
      await creditPaidSaleIdempotent({
        transactionId: tx.id,
        providerId: remoteId,
        provider: "velana",
        sellerId: tx.sellerId,
        amount: Number(tx.amount),
        feeAmount: Number(tx.feeAmount),
      });
    } else if (tx && tx.status === "pendente") {
      await prisma.transaction.updateMany({
        where: { id: tx.id, status: "pendente" },
        data: {
          status: statusTx,
          refundedAt: statusTx === "reembolsada" ? new Date() : undefined,
        },
      });
      if (statusTx === "recusada" || statusTx === "reembolsada") {
        await prisma.user.update({
          where: { id: tx.sellerId },
          data: {
            balancePending: { decrement: Number(tx.amount) },
          },
        });
      }
      await prisma.paymentCharge.updateMany({
        where: {
          OR: [{ providerId: remoteId }, { id: `vl_${remoteId}` }],
        },
        data: { status: statusCharge },
      });
    }
    return;
  }

  // ── Transferência / saque ─────────────────────────────
  if (type === "transfer") {
    const mapped = mapVelanaTransferStatus(String(data.status || ""));
    await prisma.withdrawal.updateMany({
      where: {
        OR: [{ providerId: remoteId }, { id: remoteId }],
      },
      data: { status: mapped, reviewedAt: new Date() },
    });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "velana",
    path: "/api/v1/webhooks/velana",
    docs: "https://velana.readme.io/reference/formato-dos-postbacks",
    auth: "Basic base64(secretKey:x)",
    events: ["transaction", "checkout", "transfer"],
    configurePostback:
      "Defina NEXT_PUBLIC_APP_URL ou VELANA_POSTBACK_BASE_URL (URL pública). Em localhost use sync em /api/v1/payments/:id/sync.",
  });
}
