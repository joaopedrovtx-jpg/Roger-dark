import { NextResponse } from "next/server";
import type { VelanaPostbackPayload } from "@/lib/acquirers/velana/types";
import { applyVelanaWebhook } from "@/lib/acquirers/velana/gateway";
import {
  mapVelanaTxStatus,
  mapVelanaTransferStatus,
} from "@/lib/acquirers/velana/mappers";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import {
  creditPaidSaleIdempotent,
  refundSaleIdempotent,
  rejectPendingSaleIdempotent,
} from "@/lib/server/balance";
import { verifyVelanaWebhook } from "@/lib/server/hmac";

/**
 * POST /api/v1/webhooks/velana
 *
 * A Velana NÃO documenta HMAC nos postbacks.
 * - Se houver assinatura + secret → valida HMAC.
 * - Sem assinatura: aceita, mas TODO status que mexe dinheiro é
 *   reconfirmado na API Velana (GET /transactions/:id).
 * - Se paid não confirmar na API → HTTP 503 para a Velana reenviar.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-velana-signature") ||
      req.headers.get("x-hub-signature-256") ||
      req.headers.get("x-signature");

    const secret = process.env.VELANA_WEBHOOK_SECRET;
    let signedOk = false;

    if (signature?.trim() && secret?.trim()) {
      const sigCheck = verifyVelanaWebhook(rawBody, signature, secret);
      if (!sigCheck.ok) {
        return NextResponse.json(
          { error: "Assinatura inválida", reason: sigCheck.reason },
          { status: 401 }
        );
      }
      signedOk = true;
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

    const vData = (payload.data || {}) as Record<string, unknown>;
    const vRemoteId = String(vData.id ?? payload.objectId ?? "").trim();
    const { recordInbox, markInbox } = await import(
      "@/lib/server/webhook-inbox"
    );
    const inbox = await recordInbox({
      provider: "velana",
      eventId: undefined,
      eventName: String(payload.type || ""),
      remoteId: vRemoteId || undefined,
      payload,
    });

    let applyResult: ApplyResult = { ok: true };

    if (isDatabaseConfigured()) {
      try {
        const { enqueueWebhookJob } = await import(
          "@/lib/server/webhook-queue"
        );
        await enqueueWebhookJob("velana", async () => {
          applyResult = await applyWebhookToMysql(payload, { signedOk });
        });
        if (inbox.created) {
          await markInbox(
            inbox.inboxId,
            applyResult.ok ? "applied" : "failed",
            applyResult.reason
          );
        }
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

    // Paid não confirmado na Velana → 503 para forçar retry
    if (applyResult.retry) {
      const { log } = await import("@/lib/server/logger");
      log.warn(
        { remoteId: vRemoteId, reason: applyResult.reason },
        "velana_webhook_retry"
      );
      return NextResponse.json(
        {
          error: "Confirmação Velana pendente",
          reason: applyResult.reason || "confirm_failed",
        },
        { status: 503 }
      );
    }

    const { log } = await import("@/lib/server/logger");
    log.info(
      {
        message: result.message,
        type: String(payload.type || ""),
        remoteId: vRemoteId,
        signedOk,
        applied: applyResult.ok,
      },
      "velana_webhook"
    );

    return NextResponse.json({
      success: true,
      message: result.message,
      queued: true,
      signedOk,
      applied: applyResult.ok,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro no webhook";
    const { log } = await import("@/lib/server/logger");
    log.error({ error: msg }, "velana_webhook_error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type ApplyResult = {
  ok: boolean;
  retry?: boolean;
  reason?: string;
};

function normalizePayload(
  payload: VelanaPostbackPayload
): VelanaPostbackPayload {
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
  if (!payload.type && payload.data?.status != null) {
    return { ...payload, type: "transaction" };
  }
  return payload;
}

async function fetchVelanaRemoteStatus(
  remoteId: string
): Promise<{ ok: boolean; status?: string; mapped?: string }> {
  try {
    const { resolveVelanaConfigServer } = await import(
      "@/lib/acquirers/velana/config"
    );
    const { velanaClient } = await import("@/lib/acquirers/velana/client");
    const config = await resolveVelanaConfigServer();
    if (!config?.secretKey) return { ok: false, status: "no_config" };
    const remote = await velanaClient.getTransaction(remoteId, config);
    const st = String(remote.status || "");
    return { ok: true, status: st, mapped: mapVelanaTxStatus(st) };
  } catch (e) {
    const { log } = await import("@/lib/server/logger");
    log.warn(
      {
        remoteId,
        error: e instanceof Error ? e.message : String(e),
      },
      "velana_fetch_status_failed"
    );
    return { ok: false, status: "fetch_error" };
  }
}

async function fetchVelanaRemoteTransferStatus(
  remoteId: string
): Promise<{ ok: boolean; status?: string; mapped?: string }> {
  try {
    const { resolveVelanaConfigServer } = await import(
      "@/lib/acquirers/velana/config"
    );
    const { velanaClient } = await import("@/lib/acquirers/velana/client");
    const config = await resolveVelanaConfigServer();
    if (!config?.secretKey) return { ok: false, status: "no_config" };
    const remote = await velanaClient.getTransfer(remoteId, config);
    const st = String(remote.status || "");
    return { ok: true, status: st, mapped: mapVelanaTransferStatus(st) };
  } catch (e) {
    const { log } = await import("@/lib/server/logger");
    log.warn(
      {
        remoteId,
        error: e instanceof Error ? e.message : String(e),
      },
      "velana_fetch_transfer_status_failed"
    );
    return { ok: false, status: "fetch_error" };
  }
}

async function applyWebhookToMysql(
  payload: VelanaPostbackPayload,
  opts: { signedOk: boolean }
): Promise<ApplyResult> {
  const type = String(payload.type || "").toLowerCase();
  let data = (payload.data || {}) as Record<string, unknown>;

  if (type === "checkout" && data.transaction) {
    data = data.transaction as Record<string, unknown>;
  }

  const remoteId = String(data.id ?? payload.objectId ?? "").trim();
  if (!remoteId) return { ok: true };

  // ── Transação / checkout ──────────────────────────────
  if (
    type === "transaction" ||
    type === "checkout" ||
    (data.status != null && type !== "transfer")
  ) {
    let mapped = mapVelanaTxStatus(String(data.status || ""));
    const postbackSaysPaid = mapped === "aprovada";
    const postbackSaysTerminal =
      mapped === "aprovada" ||
      mapped === "recusada" ||
      mapped === "reembolsada";

    // Sem HMAC: reconfirma na API qualquer status terminal que mexe saldo
    if (!opts.signedOk && postbackSaysTerminal) {
      const remote = await fetchVelanaRemoteStatus(remoteId);
      if (!remote.ok) {
        // Paid sem confirmação → retry; outros status: ignora mutação
        if (postbackSaysPaid) {
          return {
            ok: false,
            retry: true,
            reason: remote.status || "confirm_failed",
          };
        }
        return {
          ok: false,
          reason: `unconfirmed_${remote.status || "fetch_error"}`,
        };
      }
      mapped = (remote.mapped as typeof mapped) || mapped;
      // Se postback diz paid mas API não confirma paid → 503
      if (postbackSaysPaid && mapped !== "aprovada") {
        return {
          ok: false,
          retry: true,
          reason: `velana_status_${remote.status}`,
        };
      }
    }

    const tx = await prisma.transaction.findFirst({
      where: {
        OR: [
          { providerId: remoteId, provider: "velana" },
          { providerId: remoteId },
          { id: `TX-VL-${remoteId}` },
        ],
      },
    });

    if (!tx) {
      const { log } = await import("@/lib/server/logger");
      log.warn({ remoteId, mapped }, "velana_webhook_tx_not_found");
      // Se paid e não achou TX, pedir retry (persist pode ter atrasado)
      if (mapped === "aprovada") {
        return { ok: false, retry: true, reason: "tx_not_found" };
      }
      return { ok: true, reason: "tx_not_found" };
    }

    if (mapped === "aprovada") {
      const { notifyUtmifyAfterPaid } = await import("@/lib/server/balance");
      const credit = await creditPaidSaleIdempotent({
        transactionId: tx.id,
        providerId: remoteId,
        provider: "velana",
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
      return { ok: true };
    }

    if (mapped === "recusada") {
      await rejectPendingSaleIdempotent({
        transactionId: tx.id,
        sellerId: tx.sellerId,
        amount: Number(tx.amount),
        providerId: remoteId,
        chargeStatus: "cancelled",
      });
      return { ok: true };
    }

    if (mapped === "reembolsada") {
      await refundSaleIdempotent({
        transactionId: tx.id,
        sellerId: tx.sellerId,
        amount: Number(tx.amount),
        feeAmount: Number(tx.feeAmount),
        netAmount: Number(tx.netAmount),
        providerId: remoteId,
      });
      return { ok: true };
    }

    return { ok: true };
  }

  // ── Transferência / saque ─────────────────────────────
  if (type === "transfer") {
    let mapped = mapVelanaTransferStatus(String(data.status || ""));

    if (!opts.signedOk) {
      const remote = await fetchVelanaRemoteTransferStatus(remoteId);
      if (!remote.ok) {
        return { ok: false, retry: true, reason: remote.status || "confirm_failed" };
      }
      mapped = (remote.mapped as typeof mapped) || mapped;
      const local = await prisma.withdrawal.findFirst({
        where: {
          OR: [{ providerId: remoteId }, { id: remoteId }],
        },
        select: { id: true, status: true },
      });
      if (!local) {
        return { ok: false, reason: "withdrawal_not_found" };
      }
    }

    await prisma.withdrawal.updateMany({
      where: {
        OR: [{ providerId: remoteId }, { id: remoteId }],
      },
      data: { status: mapped, reviewedAt: new Date() },
    });
    return { ok: true };
  }

  return { ok: true };
}

export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
