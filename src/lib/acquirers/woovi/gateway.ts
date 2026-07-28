/**
 * Gateway Woovi/OpenPix → domínio DarkPay
 * Docs: https://developers.openpix.com.br/en/api
 */

import { randomBytes } from "crypto";
import {
  adjustBalance,
  getStore,
  type PaymentCharge,
} from "@/lib/server/memory-store";
import type {
  CreateWithdrawalInput,
  SaqueStatus,
  Withdrawal,
} from "@/lib/domain/types";
import { wooviClient, WooviError } from "./client";
import {
  isWooviEnabledServer,
  resolveWooviConfig,
  resolveWooviConfigServer,
} from "./config";
import {
  extractWooviBrCode,
  extractWooviCorrelationId,
  extractWooviQrImage,
  fromCents,
  mapWooviChargeStatus,
  mapWooviPaymentStatus,
  mapWooviWebhookStatus,
  onlyDigits,
  sanitizeCorrelationId,
  sanitizeWooviCustomerName,
  toWooviPaymentDestination,
  wooviSafeComment,
  toCents,
} from "./mappers";
import type { WooviConfig, WooviWebhookPayload } from "./types";
import { computeSaleFeeAmount } from "@/lib/server/seller-fees";

export interface CreateChargeViaWooviInput {
  sellerId: string;
  amount: number;
  description?: string;
  customerName?: string;
  customerDocument?: string;
  customerEmail?: string;
  customerPhone?: string;
  externalRef?: string;
  config?: WooviConfig | null;
  feePercent?: number;
  feeFixed?: number;
  expiresInMinutes?: number;
}

function correlationIdForCharge(sellerId: string, externalRef?: string): string {
  if (externalRef?.trim()) {
    const clean = sanitizeCorrelationId(externalRef);
    if (clean.length >= 8) return clean;
  }
  return `dp_${sanitizeCorrelationId(sellerId).slice(0, 12)}_${randomBytes(8).toString("hex")}`;
}

export async function createChargeViaWoovi(
  input: CreateChargeViaWooviInput
): Promise<PaymentCharge> {
  const config =
    input.config ??
    (typeof window === "undefined"
      ? await resolveWooviConfigServer()
      : resolveWooviConfig());

  if (!config?.appId) {
    throw new WooviError(
      "Woovi não configurada. Salve o AppID em Admin → Adquirentes → Credenciais → Woovi.",
      { code: "WOOVI_NOT_CONFIGURED" }
    );
  }

  const amountCents = toCents(input.amount);
  if (amountCents < 1) {
    throw new WooviError("Valor mínimo Woovi: R$ 0,01 (1 centavo)", {
      code: "MIN_AMOUNT",
    });
  }

  const correlationID = correlationIdForCharge(
    input.sellerId,
    input.externalRef
  );
  const expiresIn = Math.max(
    300,
    Math.round((input.expiresInMinutes ?? 15) * 60)
  );

  // Nunca envia título da oferta no comment (pode ter emoji e a Woovi rejeita).
  // Descrição da oferta fica só no DarkPay (DB). Para a API: comment fixo seguro.
  const customerName = sanitizeWooviCustomerName(input.customerName);
  const taxID = onlyDigits(input.customerDocument || "");
  const email = input.customerEmail?.trim().toLowerCase();
  const phoneDigits = onlyDigits(input.customerPhone || "");
  const phone =
    phoneDigits.length >= 10
      ? phoneDigits.startsWith("55")
        ? phoneDigits
        : `55${phoneDigits}`
      : undefined;

  const customer: {
    name: string;
    taxID?: string;
    email?: string;
    phone?: string;
  } = { name: customerName };
  if (taxID.length === 11 || taxID.length === 14) customer.taxID = taxID;
  if (email) customer.email = email;
  if (phone) customer.phone = phone;

  // Payload mínimo e estável — sem description da oferta
  const chargeBody = {
    correlationID,
    value: amountCents,
    comment: wooviSafeComment(), // sempre "Pagamento" — sem emoji, sem título de oferta
    expiresIn,
    customer:
      customer.taxID || customer.email || customer.phone
        ? customer
        : { name: customerName },
  };

  console.info("[woovi] POST /api/v1/charge", {
    value: amountCents,
    correlationID,
    hasCustomer: !!customer.name,
  });

  let remote;
  try {
    remote = await wooviClient.createCharge(chargeBody, { config });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na cobrança";
    console.error("[woovi] createCharge failed", msg, {
      amount: amountCents,
      correlationID,
    });
    // Mantém código interno; a rota /payments sanitiza a mensagem pública
    throw e;
  }

  const chargeRemote = remote.charge || (remote as { charge?: undefined });
  const ch = remote.charge;
  if (!ch && !remote.brCode) {
    throw new WooviError(
      "Woovi retornou resposta sem cobrança. Verifique o AppID e o payload.",
      { code: "WOOVI_INVALID_RESPONSE", details: remote }
    );
  }

  const providerId =
    extractWooviCorrelationId(ch) ||
    correlationID ||
    String(Date.now());

  const brCode = extractWooviBrCode(ch) || remote.brCode || "";
  let qrImage = extractWooviQrImage(ch);
  if (!qrImage && brCode) {
    try {
      const QRCode = (await import("qrcode")).default;
      qrImage = await QRCode.toDataURL(brCode, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#0a0f0c", light: "#ffffff" },
      });
    } catch {
      /* UI gera no browser */
    }
  }

  const mapped = mapWooviChargeStatus(ch?.status);
  const amountReais = fromCents(
    typeof ch?.value === "number" ? ch.value : amountCents
  );
  const now = new Date().toISOString();
  const expiresAt =
    ch?.expiresDate ||
    new Date(Date.now() + expiresIn * 1000).toISOString();

  const charge: PaymentCharge = {
    id: providerId,
    sellerId: input.sellerId,
    amount: amountReais,
    currency: "BRL",
    status:
      mapped === "aprovada"
        ? "paid"
        : mapped === "recusada"
          ? "cancelled"
          : "waiting_payment",
    method: "PIX",
    description: input.description,
    customerName: input.customerName,
    customerDocument: taxID || undefined,
    pixCopyPaste: brCode || undefined,
    pixQrCode: qrImage || undefined,
    expiresAt,
    createdAt: ch?.createdAt || now,
    paidAt: mapped === "aprovada" ? ch?.paidAt || now : undefined,
  };

  let feePercent = input.feePercent;
  let feeFixed = input.feeFixed;
  if (feePercent == null || feeFixed == null) {
    try {
      const { getSellerSaleFees } = await import("@/lib/server/seller-fees");
      const plan = await getSellerSaleFees(input.sellerId);
      feePercent = feePercent ?? plan.mdrPercent;
      feeFixed = feeFixed ?? plan.mdrFixed;
    } catch {
      feePercent = feePercent ?? 0;
      feeFixed = feeFixed ?? 0;
    }
  }
  const fee = computeSaleFeeAmount(charge.amount, {
    mdrPercent: feePercent ?? 0,
    mdrFixed: feeFixed ?? 0,
  });
  const net = Math.max(0, Math.round((charge.amount - fee) * 100) / 100);

  const txLocalId = `TX-WO-${randomBytes(4).toString("hex")}`;
  charge.transactionId = txLocalId;

  const store = getStore();
  store.charges.unshift(charge);
  store.transactions.unshift({
    id: txLocalId,
    date: charge.createdAt,
    sellerId: input.sellerId,
    kind: "venda",
    direction: "entrada",
    description: input.description || "Cobrança PIX Woovi",
    method: "PIX",
    amount: charge.amount,
    status: mapped,
    customer: input.customerName,
    product: input.description,
  });

  if (charge.status === "waiting_payment") {
    adjustBalance(input.sellerId, { pending: charge.amount });
  } else if (charge.status === "paid") {
    adjustBalance(input.sellerId, { available: net });
  }

  await persistChargeToMysql(charge, input, providerId, mapped, fee, net);
  void chargeRemote;
  return charge;
}

async function persistChargeToMysql(
  charge: PaymentCharge,
  input: CreateChargeViaWooviInput,
  providerId: string,
  mappedStatus: string,
  fee: number,
  net: number
) {
  const { prisma, isDatabaseConfigured } = await import(
    "@/lib/server/prisma"
  );
  if (!isDatabaseConfigured()) {
    throw new WooviError("Banco indisponível para gravar cobrança", {
      code: "DB_UNAVAILABLE",
    });
  }

  const txLocalId = charge.transactionId || `TX-WO-${Date.now()}`;
  const user = await prisma.user.findUnique({
    where: { id: input.sellerId },
  });
  if (!user) {
    throw new WooviError("Seller não encontrado para gravar cobrança", {
      code: "SELLER_NOT_FOUND",
    });
  }

  const chargeDbId =
    providerId.length <= 60
      ? `wo_${providerId}`.slice(0, 64)
      : `pay_${Date.now().toString(36)}_${randomBytes(6).toString("base64url")}`;

  await prisma.$transaction(async (db) => {
    await db.transaction.create({
      data: {
        id: txLocalId,
        date: new Date(charge.createdAt),
        sellerId: input.sellerId,
        sellerName: user.name,
        kind: "venda",
        direction: "entrada",
        description: input.description || "Cobrança PIX Woovi",
        method: "PIX",
        amount: charge.amount,
        feeAmount: fee,
        netAmount: net,
        platformFee: fee,
        status: mappedStatus === "aprovada" ? "aprovada" : "pendente",
        customer: input.customerName,
        customerDocument: charge.customerDocument,
        product: input.description,
        acquirerId: "woovi",
        provider: "woovi",
        providerId,
        paidAt: charge.paidAt ? new Date(charge.paidAt) : null,
      },
    });

    await db.paymentCharge.create({
      data: {
        id: chargeDbId.slice(0, 64),
        sellerId: input.sellerId,
        amount: charge.amount,
        currency: "BRL",
        status:
          charge.status === "paid"
            ? "paid"
            : charge.status === "cancelled"
              ? "cancelled"
              : "waiting_payment",
        method: "PIX",
        description: input.description,
        customerName: input.customerName,
        customerDocument: charge.customerDocument,
        pixQrCode: charge.pixQrCode,
        pixCopyPaste: charge.pixCopyPaste,
        expiresAt: new Date(charge.expiresAt),
        paidAt: charge.paidAt ? new Date(charge.paidAt) : null,
        transactionId: txLocalId,
        provider: "woovi",
        providerId,
      },
    });

    if (mappedStatus === "pendente" || charge.status === "waiting_payment") {
      await db.user.update({
        where: { id: input.sellerId },
        data: { balancePending: { increment: charge.amount } },
      });
    } else if (mappedStatus === "aprovada") {
      await db.user.update({
        where: { id: input.sellerId },
        data: {
          balanceAvailable: { increment: net },
          volumeTotal: { increment: charge.amount },
        },
      });
    }
  });
}

/**
 * Cria solicitação de saque (PIX out) na Woovi — status CREATED.
 * NÃO envia o dinheiro ainda; aparece em Saques/Pagamentos na Woovi.
 *
 * Docs: POST /api/v1/payment
 * https://developers.woovi.com/en/docs/payment/payment-how-to-use-api-to-create
 *
 * Fluxo DarkPay:
 * 1) Seller solicita → createWithdrawalViaWoovi (CREATED / processando)
 * 2) Admin aprova → approveWithdrawalViaWoovi (APPROVED → CONFIRMED)
 *
 * @param opts.autoApprove true = cria e paga em uma chamada (admin)
 */
export async function createWithdrawalViaWoovi(
  sellerId: string,
  sellerName: string,
  input: CreateWithdrawalInput,
  opts?: {
    config?: WooviConfig | null;
    skipLocalDebit?: boolean;
    /** correlationID estável — idempotência (reusar em retries) */
    correlationId?: string;
    autoApprove?: boolean;
  }
): Promise<Withdrawal> {
  const config =
    opts?.config ??
    (typeof window === "undefined"
      ? await resolveWooviConfigServer()
      : resolveWooviConfig());

  if (!config?.appId) {
    throw new WooviError("Woovi não configurada", {
      code: "WOOVI_NOT_CONFIGURED",
    });
  }

  const amountCents = toCents(input.amount);
  if (amountCents < 1) {
    throw new WooviError("Valor mínimo Woovi: R$ 0,01", {
      code: "MIN_AMOUNT",
    });
  }

  const correlationID = sanitizeCorrelationId(
    opts?.correlationId ||
      `wd_${sellerId.slice(0, 10)}_${randomBytes(6).toString("hex")}`
  );
  const dest = toWooviPaymentDestination(input.pixKey);

  const remote = await wooviClient.createPayment(
    {
      value: amountCents,
      destinationAlias: dest.destinationAlias,
      destinationAliasType: dest.destinationAliasType,
      correlationID,
      comment: wooviSafeComment(),
      ...(opts?.autoApprove ? { autoApprove: true } : {}),
    },
    { config }
  );

  const payment =
    (remote as { payment?: WooviPaymentShape }).payment ||
    (remote as WooviPaymentShape);

  const status = mapWooviPaymentStatus(payment?.status);
  const id = String(payment?.correlationID || correlationID);

  const w: Withdrawal = {
    id,
    sellerId,
    sellerName,
    date: new Date().toISOString(),
    amount: fromCents(
      typeof payment?.value === "number" ? payment.value : amountCents
    ),
    method: "PIX",
    destination: input.pixKey.trim(),
    status,
    feePercent: 0,
    feeFixed: 0,
  };

  if (w.status === "processando" && !opts?.skipLocalDebit) {
    adjustBalance(sellerId, { available: -w.amount });
  }

  getStore().withdrawals.unshift(w);
  getStore().transactions.unshift({
    id: w.id,
    date: w.date,
    sellerId,
    sellerName,
    kind: "saque",
    direction: "saida",
    description: 'Saque "Woovi"',
    method: "PIX",
    amount: w.amount,
    status: w.status,
  });

  return w;
}

type WooviPaymentShape = {
  status?: string;
  correlationID?: string;
  value?: number;
};

/**
 * Aprova um payment já criado (CREATED) na Woovi — envia o PIX.
 * Docs: POST /api/v1/payment/approve { correlationID }
 */
export async function approveWithdrawalViaWoovi(
  correlationID: string,
  opts?: { config?: WooviConfig | null }
): Promise<{
  status: SaqueStatus;
  correlationID: string;
  payment?: WooviPaymentShape;
}> {
  const config =
    opts?.config ??
    (typeof window === "undefined"
      ? await resolveWooviConfigServer()
      : resolveWooviConfig());

  if (!config?.appId) {
    throw new WooviError("Woovi não configurada", {
      code: "WOOVI_NOT_CONFIGURED",
    });
  }

  const id = sanitizeCorrelationId(correlationID);
  if (!id) {
    throw new WooviError("correlationID do saque ausente", {
      code: "WOOVI_BAD_REQUEST",
    });
  }

  const remote = await wooviClient.approvePayment(id, { config });
  const payment =
    (remote as { payment?: WooviPaymentShape }).payment ||
    (remote as WooviPaymentShape);
  const status = mapWooviPaymentStatus(payment?.status || "APPROVED");

  return {
    status,
    correlationID: String(payment?.correlationID || id),
    payment,
  };
}

export async function syncBalanceFromWoovi(_sellerId?: string) {
  const config = await resolveWooviConfigServer();
  if (!config?.appId) return null;
  const remote = await wooviClient.listAccounts(config);
  const accounts = remote.accounts || [];
  const def =
    accounts.find((a) => a.isDefault) ||
    accounts[0] ||
    null;
  if (!def?.balance) return null;
  return {
    available: fromCents(def.balance.available ?? 0),
    pending: fromCents(def.balance.blocked ?? 0),
    held: 0,
    accountId: def.accountId,
  };
}

/**
 * Aplica webhook Woovi (OPENPIX:CHARGE_COMPLETED etc.) em memória.
 * MySQL é atualizado na rota do webhook via creditPaidSaleIdempotent.
 */
export function applyWooviWebhook(payload: WooviWebhookPayload): {
  ok: boolean;
  kind?: "charge" | "unknown";
  status?: string;
  remoteId?: string;
} {
  const event = String(payload.event || "").toUpperCase();
  const charge = payload.charge || payload.pix?.charge;
  if (!charge && !event.includes("CHARGE")) {
    return { ok: true, kind: "unknown" };
  }

  const remoteId = extractWooviCorrelationId(charge);
  // Evento COMPLETED manda aprovar mesmo com status ACTIVE no payload
  const status = mapWooviWebhookStatus(event, charge?.status);

  // Atualiza memory store se houver charge local
  try {
    const store = getStore();
    const local = store.charges.find(
      (c) =>
        c.id === remoteId ||
        c.transactionId === remoteId ||
        (charge?.transactionID && c.id === charge.transactionID)
    );
    if (local && status === "aprovada" && local.status !== "paid") {
      local.status = "paid";
      local.paidAt = charge?.paidAt || new Date().toISOString();
    }
  } catch {
    /* ignore */
  }

  return {
    ok: true,
    kind: "charge",
    status,
    remoteId: remoteId || undefined,
  };
}

/**
 * Consulta a charge na Woovi e, se paga, credita a venda no MySQL (idempotente).
 * Usado por POST /api/v1/payments/:id/sync e reconcile — cobre o caso em que
 * o webhook não chegou ou falhou.
 */
export async function syncChargeFromWoovi(
  chargeOrProviderId: string,
  sellerId?: string
): Promise<PaymentCharge> {
  const config = await resolveWooviConfigServer();
  if (!config?.appId) {
    throw new WooviError("Woovi não configurada", {
      code: "WOOVI_NOT_CONFIGURED",
    });
  }

  const store = getStore();
  let local = store.charges.find(
    (c) =>
      c.id === chargeOrProviderId ||
      c.transactionId === chargeOrProviderId
  );

  let providerId = local?.id;
  let chargeDbId: string | undefined;
  let txLocalId: string | undefined = local?.transactionId;

  const { prisma, isDatabaseConfigured } = await import(
    "@/lib/server/prisma"
  );

  if (isDatabaseConfigured()) {
    const row = await prisma.paymentCharge.findFirst({
      where: {
        OR: [
          { id: chargeOrProviderId },
          { providerId: chargeOrProviderId },
          { transactionId: chargeOrProviderId },
          ...(chargeOrProviderId.startsWith("wo_")
            ? []
            : [{ id: `wo_${chargeOrProviderId}`.slice(0, 64) }]),
        ],
        ...(sellerId ? { sellerId } : {}),
      },
    });
    if (row) {
      providerId = row.providerId || row.id.replace(/^wo_/, "");
      chargeDbId = row.id;
      txLocalId = row.transactionId ?? txLocalId;
      if (!local) {
        local = {
          id: row.providerId || row.id,
          sellerId: row.sellerId,
          amount: Number(row.amount),
          currency: "BRL",
          status: row.status as PaymentCharge["status"],
          method: "PIX",
          description: row.description ?? undefined,
          customerName: row.customerName ?? undefined,
          customerDocument: row.customerDocument ?? undefined,
          pixCopyPaste: row.pixCopyPaste ?? undefined,
          pixQrCode: row.pixQrCode ?? undefined,
          expiresAt: row.expiresAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
          paidAt: row.paidAt?.toISOString(),
          transactionId: row.transactionId ?? undefined,
        };
      }
    }

    // Fallback: TX id (TX-WO-xxxx) → providerId
    if (!providerId) {
      const tx = await prisma.transaction.findFirst({
        where: {
          OR: [
            { id: chargeOrProviderId },
            { providerId: chargeOrProviderId },
          ],
          ...(sellerId ? { sellerId } : {}),
          provider: "woovi",
        },
      });
      if (tx) {
        providerId = tx.providerId || undefined;
        txLocalId = tx.id;
        if (!local) {
          local = {
            id: tx.providerId || tx.id,
            sellerId: tx.sellerId,
            amount: Number(tx.amount),
            currency: "BRL",
            status:
              tx.status === "aprovada"
                ? "paid"
                : tx.status === "recusada"
                  ? "cancelled"
                  : "waiting_payment",
            method: "PIX",
            description: tx.description ?? undefined,
            customerName: tx.customer ?? undefined,
            customerDocument: tx.customerDocument ?? undefined,
            expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
            createdAt: tx.createdAt.toISOString(),
            paidAt: tx.paidAt?.toISOString(),
            transactionId: tx.id,
          };
        }
      }
    }
  }

  if (!providerId && !local) {
    throw new WooviError("Cobrança Woovi não encontrada", {
      code: "NOT_FOUND",
    });
  }

  const remoteLookup = String(
    providerId || local?.id || chargeOrProviderId
  ).replace(/^wo_/, "");

  let remote: { charge?: import("./types").WooviCharge };
  try {
    remote = await wooviClient.getCharge(remoteLookup, config);
  } catch (e) {
    // Tenta com correlationID da TX se o id local for TX-WO-*
    if (providerId && providerId !== remoteLookup) {
      remote = await wooviClient.getCharge(providerId, config);
    } else {
      throw e;
    }
  }

  const ch = remote.charge;
  if (!ch) {
    throw new WooviError("Woovi não retornou a cobrança", {
      code: "WOOVI_INVALID_RESPONSE",
      details: remote,
    });
  }

  const mapped = mapWooviChargeStatus(ch.status);
  const now = new Date().toISOString();
  const nextStatus: PaymentCharge["status"] =
    mapped === "aprovada"
      ? "paid"
      : mapped === "recusada"
        ? "cancelled"
        : "waiting_payment";

  if (local) {
    const wasWaiting = local.status === "waiting_payment";
    local.status = nextStatus;
    if (nextStatus === "paid" && !local.paidAt) {
      local.paidAt = ch.paidAt || now;
    }
    if (local.transactionId) {
      const tx = store.transactions.find((t) => t.id === local!.transactionId);
      if (tx) {
        tx.status =
          mapped === "aprovada"
            ? "aprovada"
            : mapped === "recusada"
              ? "recusada"
              : "pendente";
      }
    }
    if (wasWaiting && nextStatus === "paid") {
      let fee = computeSaleFeeAmount(local.amount, {
        mdrPercent: 0,
        mdrFixed: 0,
      });
      try {
        const { getSellerSaleFees } = await import("@/lib/server/seller-fees");
        const plan = await getSellerSaleFees(local.sellerId);
        fee = computeSaleFeeAmount(local.amount, plan);
      } catch {
        /* default */
      }
      const net = Math.max(0, Math.round((local.amount - fee) * 100) / 100);
      adjustBalance(local.sellerId, {
        pending: -local.amount,
        available: net,
      });
    }
    if (!store.charges.some((c) => c.id === local!.id)) {
      store.charges.unshift(local);
    }
  }

  if (isDatabaseConfigured() && (chargeDbId || remoteLookup || txLocalId)) {
    await applyWooviPaidStatusToMysql({
      providerId: remoteLookup,
      chargeId: chargeDbId,
      transactionId: txLocalId,
      mapped,
      sellerId: local?.sellerId || sellerId,
    });
  }

  if (!local) {
    throw new WooviError("Cobrança não encontrada localmente", {
      code: "NOT_FOUND",
    });
  }

  return local;
}

async function applyWooviPaidStatusToMysql(opts: {
  providerId: string;
  chargeId?: string;
  transactionId?: string;
  mapped: string;
  sellerId?: string;
}) {
  const { prisma } = await import("@/lib/server/prisma");
  const statusCharge =
    opts.mapped === "aprovada"
      ? "paid"
      : opts.mapped === "recusada"
        ? "cancelled"
        : "waiting_payment";

  const charge = await prisma.paymentCharge.findFirst({
    where: {
      OR: [
        ...(opts.chargeId ? [{ id: opts.chargeId }] : []),
        { providerId: opts.providerId },
        { id: `wo_${opts.providerId}`.slice(0, 64) },
        ...(opts.transactionId
          ? [{ transactionId: opts.transactionId }]
          : []),
      ],
    },
  });

  const tx = opts.transactionId
    ? await prisma.transaction.findUnique({
        where: { id: opts.transactionId },
      })
    : charge?.transactionId
      ? await prisma.transaction.findUnique({
          where: { id: charge.transactionId },
        })
      : await prisma.transaction.findFirst({
          where: {
            providerId: opts.providerId,
            provider: "woovi",
          },
        });

  if (statusCharge === "paid" && tx) {
    const { creditPaidSaleIdempotent, notifyUtmifyAfterPaid } = await import(
      "@/lib/server/balance"
    );
    const amount = Number(tx.amount);
    let fee = Number(tx.feeAmount) || 0;
    if (fee <= 0) {
      try {
        const { getSellerSaleFees, computeSaleFeeAmount } = await import(
          "@/lib/server/seller-fees"
        );
        const plan = await getSellerSaleFees(tx.sellerId);
        fee = computeSaleFeeAmount(amount, plan);
      } catch {
        fee = 0;
      }
    }
    const credit = await creditPaidSaleIdempotent({
      transactionId: tx.id,
      providerId: opts.providerId || tx.providerId || undefined,
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
    return;
  }

  // Só atualiza status se não for crédito (expirado etc.)
  if (charge && statusCharge !== "paid" && statusCharge !== "waiting_payment") {
    await prisma.paymentCharge.updateMany({
      where: { id: charge.id, status: "waiting_payment" },
      data: { status: statusCharge },
    });
  }
  if (tx && opts.mapped === "recusada") {
    const { rejectPendingSaleIdempotent } = await import(
      "@/lib/server/balance"
    );
    await rejectPendingSaleIdempotent({
      transactionId: tx.id,
      sellerId: tx.sellerId,
      amount: Number(tx.amount),
      providerId: opts.providerId || tx.providerId,
    });
  }
}

export async function isWooviReady(): Promise<boolean> {
  return isWooviEnabledServer();
}
