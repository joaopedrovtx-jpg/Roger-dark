import { NextResponse } from "next/server";
import type { WooviWebhookPayload } from "@/lib/acquirers/woovi/types";
import { applyWooviWebhook } from "@/lib/acquirers/woovi/gateway";
import {
  collectWooviLookupIds,
  extractWooviCorrelationId,
  mapWooviChargeStatus,
  mapWooviPaymentStatus,
  mapWooviWebhookStatus,
} from "@/lib/acquirers/woovi/mappers";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import {
  creditPaidSaleIdempotent,
  notifyUtmifyAfterPaid,
  rejectPendingSaleIdempotent,
} from "@/lib/server/balance";
import { computeSaleFeeAmount, getSellerSaleFees } from "@/lib/server/seller-fees";
import { verifyWooviWebhook } from "@/lib/server/hmac";

/**
 * POST /api/v1/webhooks/woovi
 *
 * PIX in (vendas):
 *   OPENPIX:CHARGE_COMPLETED | CHARGE_EXPIRED | …
 *
 * PIX out (saques):
 *   OPENPIX:MOVEMENT_CONFIRMED | MOVEMENT_FAILED | MOVEMENT_REMOVED
 *   Docs: https://developers.woovi.com/en/docs/webhook/examples/webhook-payment-payload
 *
 * Segurança:
 * - Se WOOVI_WEBHOOK_SECRET setado → exige Authorization/header igual.
 * - Sem secret → aceita (não quebra deploy), mas TODO status que mexe
 *   dinheiro é reconfirmado na API Woovi antes de creditar/finalizar.
 *
 * URL: https://darkpays.online/api/v1/webhooks/woovi
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    const secret = process.env.WOOVI_WEBHOOK_SECRET;
    const authCheck = verifyWooviWebhook(req, secret);
    if (!authCheck.ok) {
      return NextResponse.json(
        { error: "Não autorizado", reason: authCheck.reason },
        { status: 401 }
      );
    }
    const signedOk = authCheck.signed === true;

    let payload: WooviWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as WooviWebhookPayload;
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const event = String(payload.event || "").toUpperCase();
    const isPaymentEvent =
      event.includes("MOVEMENT_") ||
      event.includes("PAYMENT_") ||
      !!payload.payment;

    const charge = payload.charge || payload.pix?.charge;
    const paymentCorr =
      String(payload.payment?.correlationID || "").trim() || "";
    const remoteId =
      paymentCorr ||
      extractWooviCorrelationId(charge) ||
      String(payload.pix?.transactionID || "").trim() ||
      "";

    const lookupIds = collectWooviLookupIds(charge, {
      pixTransactionId: payload.pix?.transactionID,
    });
    if (paymentCorr && !lookupIds.includes(paymentCorr)) {
      lookupIds.unshift(paymentCorr);
    }
    if (remoteId && !lookupIds.includes(remoteId)) lookupIds.unshift(remoteId);

    const { recordInbox, markInbox } = await import(
      "@/lib/server/webhook-inbox"
    );
    const inbox = await recordInbox({
      provider: "woovi",
      eventId: undefined,
      eventName: event || "unknown",
      remoteId: remoteId || lookupIds[0] || undefined,
      payload,
    });

    applyWooviWebhook(payload);

    let applied = false;
    let reason: string | undefined;
    let shouldRetry = false;

    if (!isDatabaseConfigured()) {
      return NextResponse.json({ ok: true, event, reason: "no_db", signedOk });
    }

    try {
      const { enqueueWebhookJob } = await import("@/lib/server/webhook-queue");
      await enqueueWebhookJob("woovi", async () => {
        // ── PIX OUT (saque) ──────────────────────────────────
        if (isPaymentEvent && lookupIds.length > 0) {
          const result = await applyPaymentWebhook(event, lookupIds, {
            signedOk,
          });
          applied = result.applied;
          reason = result.reason;
          shouldRetry = result.shouldRetry;
          return;
        }

        // ── PIX IN (venda / charge) ──────────────────────────
        if ((charge || event.includes("CHARGE")) && lookupIds.length > 0) {
          const result = await applyChargeWebhook(
            event,
            charge,
            lookupIds,
            remoteId,
            { signedOk }
          );
          applied = result.applied;
          reason = result.reason;
          shouldRetry = result.shouldRetry;
          return;
        }

        reason = lookupIds.length ? "event_ignored" : "missing_remote_id";
      });
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e);
      if (inbox.created) await markInbox(inbox.inboxId, "failed", reason);
      return NextResponse.json({ ok: false, error: reason }, { status: 503 });
    }

    const okStatus =
      applied ||
      reason === "status_ignored" ||
      reason === "event_ignored" ||
      reason === "credited" ||
      reason === "already_approved" ||
      reason === "already_paid" ||
      reason === "rejected" ||
      reason === "not_credited" ||
      reason === "not_rejected" ||
      reason === "withdrawal_paid" ||
      reason === "withdrawal_failed_refunded" ||
      reason === "awaiting_confirmation";

    if (inbox.created) {
      await markInbox(
        inbox.inboxId,
        shouldRetry ? "failed" : okStatus ? "applied" : "failed",
        reason
      );
    }

    if (shouldRetry) {
      return NextResponse.json(
        { ok: false, event, remoteId, applied: false, reason },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      event,
      remoteId,
      applied,
      reason,
      signedOk,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Reconfirma charge (PIX in) na API Woovi — usado quando webhook não assinado. */
async function reconfirmWooviCharge(
  lookupIds: string[]
): Promise<{ ok: boolean; mapped?: string; status?: string }> {
  try {
    const { resolveWooviConfigServer } = await import(
      "@/lib/acquirers/woovi/config"
    );
    const { wooviClient } = await import("@/lib/acquirers/woovi/client");
    const config = await resolveWooviConfigServer();
    if (!config?.appId) return { ok: false, status: "no_config" };

    for (const id of lookupIds) {
      if (!id) continue;
      try {
        const remote = await wooviClient.getCharge(id, config);
        const st = String(remote.charge?.status || "");
        if (!st) continue;
        return {
          ok: true,
          status: st,
          mapped: mapWooviChargeStatus(st),
        };
      } catch {
        /* tenta próximo id */
      }
    }
    return { ok: false, status: "not_found" };
  } catch (e) {
    return {
      ok: false,
      status: e instanceof Error ? e.message : "fetch_error",
    };
  }
}

/** Reconfirma payment (PIX out) na API Woovi. */
async function reconfirmWooviPayment(
  lookupIds: string[]
): Promise<{ ok: boolean; mapped?: string; status?: string }> {
  try {
    const { resolveWooviConfigServer } = await import(
      "@/lib/acquirers/woovi/config"
    );
    const { wooviClient } = await import("@/lib/acquirers/woovi/client");
    const config = await resolveWooviConfigServer();
    if (!config?.appId) return { ok: false, status: "no_config" };

    for (const id of lookupIds) {
      if (!id) continue;
      try {
        const remote = await wooviClient.getPayment(id, config);
        const payment =
          (remote as { payment?: { status?: string } }).payment ||
          (remote as { status?: string });
        const st = String(payment?.status || "");
        if (!st) continue;
        return {
          ok: true,
          status: st,
          mapped: mapWooviPaymentStatus(st),
        };
      } catch {
        /* tenta próximo id */
      }
    }
    return { ok: false, status: "not_found" };
  } catch (e) {
    return {
      ok: false,
      status: e instanceof Error ? e.message : "fetch_error",
    };
  }
}

/** OPENPIX:MOVEMENT_CONFIRMED | FAILED | REMOVED — fonte da verdade do status do saque */
async function applyPaymentWebhook(
  event: string,
  lookupIds: string[],
  opts: { signedOk: boolean }
): Promise<{ applied: boolean; reason: string; shouldRetry: boolean }> {
  const name = event.includes(":") ? event.split(":").pop() || event : event;

  const wd = await prisma.withdrawal.findFirst({
    where: {
      OR: [
        ...lookupIds.flatMap((id) => [
          { providerId: id },
          { id },
        ]),
      ],
    },
  });

  if (!wd) {
    return {
      applied: false,
      reason: "withdrawal_not_found",
      shouldRetry:
        name === "MOVEMENT_CONFIRMED" || name === "MOVEMENT_FAILED",
    };
  }

  const {
    finalizeWithdrawalPaid,
    finalizeWithdrawalFailed,
  } = await import("@/lib/server/db/admin-withdrawals.service");

  // CONFIRMED = liquidado. APPROVED sozinho ainda é pendente pro seller.
  if (name === "MOVEMENT_CONFIRMED") {
    // Sem assinatura: reconfirma na API antes de marcar pago
    if (!opts.signedOk) {
      const remote = await reconfirmWooviPayment([
        wd.providerId || "",
        ...lookupIds,
      ].filter(Boolean));
      if (!remote.ok) {
        return {
          applied: false,
          reason: `unconfirmed_${remote.status || "fetch_error"}`,
          shouldRetry: true,
        };
      }
      if (remote.mapped !== "pago") {
        return {
          applied: false,
          reason: `woovi_status_${remote.status}`,
          shouldRetry: true,
        };
      }
    }

    const r = await finalizeWithdrawalPaid(wd.id, {
      provider: "woovi",
      providerId: wd.providerId || lookupIds[0],
      source: "webhook_woovi",
    });
    return {
      applied: r.applied,
      reason: r.reason || r.status,
      shouldRetry: false,
    };
  }

  if (
    name === "MOVEMENT_FAILED" ||
    name === "MOVEMENT_REMOVED" ||
    name === "MOVEMENT_REJECTED"
  ) {
    // Sem assinatura: reconfirma falha na API (se API indisponível, não estorna)
    if (!opts.signedOk) {
      const remote = await reconfirmWooviPayment([
        wd.providerId || "",
        ...lookupIds,
      ].filter(Boolean));
      if (!remote.ok) {
        return {
          applied: false,
          reason: `unconfirmed_${remote.status || "fetch_error"}`,
          shouldRetry: true,
        };
      }
      if (remote.mapped !== "recusado") {
        return {
          applied: false,
          reason: `woovi_status_${remote.status}`,
          shouldRetry: false,
        };
      }
    }

    const r = await finalizeWithdrawalFailed(wd.id, {
      reason: `Woovi webhook ${name}`,
      source: "webhook_woovi",
    });
    return {
      applied: r.applied,
      reason: r.reason || r.status,
      shouldRetry: false,
    };
  }

  // MOVEMENT_APPROVED / outros: adquirente liberou, seller ainda pendente
  if (name === "MOVEMENT_APPROVED") {
    await prisma.withdrawal.updateMany({
      where: { id: wd.id, status: "processando" },
      data: {
        reviewedAt: new Date(),
        provider: "woovi",
        providerId: wd.providerId || lookupIds[0],
        failureReason: null,
      },
    });
    return {
      applied: false,
      reason: "awaiting_confirmation",
      shouldRetry: false,
    };
  }

  return { applied: false, reason: "status_ignored", shouldRetry: false };
}

async function applyChargeWebhook(
  event: string,
  charge: { status?: string } | null | undefined,
  lookupIds: string[],
  remoteId: string,
  opts: { signedOk: boolean }
): Promise<{ applied: boolean; reason: string; shouldRetry: boolean }> {
  let status = mapWooviWebhookStatus(event, charge?.status);

  const orClauses: Array<Record<string, string>> = [];
  for (const id of lookupIds) {
    orClauses.push({ providerId: id });
    orClauses.push({ id });
    if (!id.startsWith("wo_")) {
      orClauses.push({ id: `wo_${id}`.slice(0, 64) });
    }
  }

  let tx = await prisma.transaction.findFirst({
    where: {
      OR: orClauses.filter((c) => Object.values(c)[0]),
      provider: "woovi",
    },
  });

  if (!tx) {
    tx = await prisma.transaction.findFirst({
      where: {
        OR: lookupIds.flatMap((id) => [{ providerId: id }, { id }]),
      },
    });
  }

  if (!tx) {
    const chargeRow = await prisma.paymentCharge.findFirst({
      where: {
        OR: lookupIds.flatMap((id) => [
          { providerId: id },
          { id },
          ...(id.startsWith("wo_") ? [] : [{ id: `wo_${id}`.slice(0, 64) }]),
        ]),
        provider: "woovi",
      },
    });
    if (chargeRow?.transactionId) {
      tx = await prisma.transaction.findUnique({
        where: { id: chargeRow.transactionId },
      });
    }
  }

  if (!tx) {
    return {
      applied: false,
      reason: "transaction_not_found",
      shouldRetry: status === "aprovada",
    };
  }

  const providerKey = tx.providerId || remoteId || lookupIds[0];
  const postbackSaysPaid = status === "aprovada";
  const postbackSaysTerminal =
    status === "aprovada" || status === "recusada";

  // Sem assinatura: reconfirma na API qualquer status terminal que mexe saldo
  if (!opts.signedOk && postbackSaysTerminal) {
    const remote = await reconfirmWooviCharge(
      [providerKey, ...lookupIds, remoteId].filter(Boolean)
    );
    if (!remote.ok) {
      if (postbackSaysPaid) {
        return {
          applied: false,
          reason: remote.status || "confirm_failed",
          shouldRetry: true,
        };
      }
      return {
        applied: false,
        reason: `unconfirmed_${remote.status || "fetch_error"}`,
        shouldRetry: false,
      };
    }
    status = (remote.mapped as typeof status) || status;
    if (postbackSaysPaid && status !== "aprovada") {
      return {
        applied: false,
        reason: `woovi_status_${remote.status}`,
        shouldRetry: true,
      };
    }
  }

  if (status === "aprovada") {
    const amount = Number(tx.amount);
    const plan = await getSellerSaleFees(tx.sellerId);
    const fee =
      Number(tx.feeAmount) > 0
        ? Number(tx.feeAmount)
        : computeSaleFeeAmount(amount, plan);
    const credit = await creditPaidSaleIdempotent({
      transactionId: tx.id,
      providerId: providerKey,
      provider: "woovi",
      sellerId: tx.sellerId,
      amount,
      feeAmount: fee,
    });
    if (credit.credited) {
      await notifyUtmifyAfterPaid({
        sellerId: tx.sellerId,
        orderId: tx.id,
        amount,
        feeAmount: fee,
        description: tx.description,
        customerName: tx.customer,
        customerEmail: tx.customerEmail,
        customerDocument: tx.customerDocument,
        createdAt: tx.createdAt,
      }).catch(() => {});
    }
    return {
      applied: credit.credited === true,
      reason: credit.credited
        ? "credited"
        : tx.status === "aprovada"
          ? "already_approved"
          : "not_credited",
      shouldRetry: false,
    };
  }

  if (status === "recusada") {
    const r = await rejectPendingSaleIdempotent({
      transactionId: tx.id,
      sellerId: tx.sellerId,
      amount: Number(tx.amount),
      providerId: providerKey,
    });
    return {
      applied: r.applied === true,
      reason: r.applied ? "rejected" : "not_rejected",
      shouldRetry: false,
    };
  }

  return { applied: false, reason: "status_ignored", shouldRetry: false };
}
