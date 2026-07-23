/**
 * Gateway Velana → domínio DarkPay (memory-store + MySQL).
 * Docs: https://velana.readme.io/reference/introducao
 *
 * Custo plataforma → Velana: R$ 0,80 / TX
 * Taxa seller padrão: 2,99% + R$ 1,00
 */

import { randomBytes } from "crypto";
import {
  adjustBalance,
  getStore,
  type PaymentCharge,
} from "@/lib/server/memory-store";
import type { CreateWithdrawalInput, Withdrawal } from "@/lib/domain/types";
import { velanaClient, VelanaError } from "./client";
import {
  computeVelanaSellerFee,
  resolveVelanaConfig,
  resolveVelanaConfigServer,
} from "./config";
import {
  extractVelanaPixEmv,
  fromCents,
  mapVelanaTransferStatus,
  mapVelanaTxStatus,
  normalizeVelanaDocument,
  normalizeVelanaPhone,
  parseVelanaPixExpiration,
  toCents,
} from "./mappers";
import type {
  VelanaConfig,
  VelanaCreateTransaction,
  VelanaPostbackPayload,
} from "./types";

export interface CreateChargeViaVelanaInput {
  sellerId: string;
  amount: number; // reais
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerDocument?: string;
  documentType?: "cpf" | "cnpj";
  tangible?: boolean;
  postbackUrl?: string;
  /** IP do pagador (campo opcional da API Velana) */
  ip?: string;
  /** Referência externa (vai em metadata string) */
  externalRef?: string;
  config?: VelanaConfig | null;
  feePercent?: number;
  feeFixed?: number;
}

/**
 * Monta o body oficial POST /v1/transactions (PIX).
 * Docs: https://velana.readme.io/reference/criar-transacao
 *
 * required: amount, paymentMethod, customer{name,email}, items[{title,unitPrice,quantity,tangible}]
 */
export function buildVelanaPixPayload(
  input: CreateChargeViaVelanaInput & { amountCents: number; postbackUrl?: string }
): VelanaCreateTransaction {
  const document = normalizeVelanaDocument(
    input.customerDocument,
    input.documentType
  );
  const phone = normalizeVelanaPhone(input.customerPhone);
  const name = (input.customerName || "Cliente").trim().slice(0, 120) || "Cliente";
  const email = (
    input.customerEmail || "cliente@email.com"
  )
    .trim()
    .toLowerCase()
    .slice(0, 120);
  const title = (input.description || "Pagamento").trim().slice(0, 200) || "Pagamento";

  // metadata na Velana é STRING (não objeto)
  const metaParts = [
    input.externalRef ? `ref=${input.externalRef}` : null,
    `seller=${input.sellerId}`,
    input.description ? `desc=${input.description.slice(0, 80)}` : null,
  ].filter(Boolean);

  const dto: VelanaCreateTransaction = {
    amount: input.amountCents,
    paymentMethod: "pix",
    customer: {
      name,
      email,
      phone,
      document: {
        type: document.type,
        number: document.number,
      },
      ...(input.externalRef
        ? { externalRef: String(input.externalRef).slice(0, 64) }
        : {}),
    },
    items: [
      {
        title,
        unitPrice: input.amountCents,
        quantity: 1,
        tangible: input.tangible ?? false,
        ...(input.externalRef
          ? { externalRef: String(input.externalRef).slice(0, 64) }
          : {}),
      },
    ],
    // expiração do QR em dias (objeto pix da criação)
    pix: { expiresInDays: 1 },
    traceable: false,
  };

  if (input.postbackUrl) {
    dto.postbackUrl = input.postbackUrl;
  }
  if (metaParts.length) {
    dto.metadata = metaParts.join("|").slice(0, 255);
  }
  if (input.ip?.trim()) {
    dto.ip = input.ip.trim().slice(0, 45);
  }

  return dto;
}

export async function createChargeViaVelana(
  input: CreateChargeViaVelanaInput
): Promise<PaymentCharge> {
  const config =
    input.config ??
    (typeof window === "undefined"
      ? await resolveVelanaConfigServer()
      : resolveVelanaConfig());

  if (!config?.secretKey) {
    throw new VelanaError(
      "Velana não configurada. Salve a secret key em Admin → Adquirentes → Credenciais (Velana) ou VELANA_SECRET_KEY no .env",
      { code: "VELANA_NOT_CONFIGURED" }
    );
  }

  const document = normalizeVelanaDocument(
    input.customerDocument,
    input.documentType
  );
  const amountCents = toCents(input.amount);
  if (amountCents < 100) {
    throw new VelanaError("Valor mínimo Velana: R$ 1,00 (100 centavos)", {
      code: "MIN_AMOUNT",
    });
  }

  const postback =
    input.postbackUrl ||
    (config.postbackBaseUrl
      ? `${config.postbackBaseUrl.replace(/\/$/, "")}/api/v1/webhooks/velana`
      : undefined);

  const dto = buildVelanaPixPayload({
    ...input,
    amountCents,
    postbackUrl: postback,
  });

  console.info("[velana] POST /transactions PIX", {
    amount: dto.amount,
    paymentMethod: dto.paymentMethod,
    customer: {
      name: dto.customer.name,
    },
    hasPostback: !!dto.postbackUrl,
  });

  let remote;
  try {
    remote = await velanaClient.createTransaction(dto, { config });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha Velana";
    console.error("[velana] createTransaction failed", msg, {
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
    });
    throw e;
  }

  if (remote == null || remote.id == null) {
    throw new VelanaError(
      "Velana retornou resposta sem id de transação. Verifique a secret key e o payload PIX.",
      { code: "VELANA_INVALID_RESPONSE", details: remote }
    );
  }
  const store = getStore();
  const now = new Date().toISOString();
  const mapped = mapVelanaTxStatus(remote.status);
  const providerId = String(remote.id);

  // Resposta: pix.qrcode (EMV) + pix.url + pix.expirationDate
  const emv = extractVelanaPixEmv(remote.pix);
  let qrImage: string | undefined;
  const pixUrl = remote.pix?.url?.trim();
  const pixQr = remote.pix?.qrcode?.trim();
  if (pixUrl?.startsWith("http") || pixUrl?.startsWith("data:")) {
    qrImage = pixUrl;
  } else if (pixQr?.startsWith("data:") || pixQr?.startsWith("http")) {
    qrImage = pixQr;
  }

  if (!qrImage && emv) {
    try {
      const QRCode = (await import("qrcode")).default;
      qrImage = await QRCode.toDataURL(emv, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#0a0f0c", light: "#ffffff" },
      });
    } catch {
      /* UI ainda gera no browser */
    }
  }

  const amountReais = fromCents(
    typeof remote.amount === "number" ? Number(remote.amount) : amountCents
  );

  const expiresAt =
    parseVelanaPixExpiration(remote.pix?.expirationDate) ||
    new Date(Date.now() + 24 * 60 * 60_000).toISOString();

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
    customerDocument: document.number,
    pixCopyPaste: emv || undefined,
    pixQrCode: qrImage || undefined,
    expiresAt,
    createdAt: remote.createdAt || now,
    paidAt: mapped === "aprovada" ? remote.paidAt || now : undefined,
  };

  // Taxa da conta do seller (Admin → Usuário → MDR); fallback Velana se não informado
  let feePercent = input.feePercent;
  let feeFixed = input.feeFixed;
  if (feePercent == null || feeFixed == null) {
    try {
      const { getSellerSaleFees } = await import("@/lib/server/seller-fees");
      const plan = await getSellerSaleFees(input.sellerId);
      feePercent = feePercent ?? plan.mdrPercent;
      feeFixed = feeFixed ?? plan.mdrFixed;
    } catch {
      /* usa default Velana */
    }
  }
  const fee = computeVelanaSellerFee(charge.amount, {
    percent: feePercent,
    fixed: feeFixed,
  });
  const net = Math.max(0, Math.round((charge.amount - fee) * 100) / 100);

  const txId = `TX-VL-${Date.now().toString().slice(-8)}`;
  charge.transactionId = txId;
  store.charges.unshift(charge);
  store.transactions.unshift({
    id: txId,
    date: charge.createdAt,
    sellerId: input.sellerId,
    kind: "venda",
    direction: "entrada",
    description: input.description || "Cobrança PIX Velana",
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

  // Persistência obrigatória: se o MySQL falhar, a cobrança não é considerada criada
  // (evita PIX pago na Velana sem TX no DarkPay).
  await persistChargeToMysql(charge, input, providerId, mapped, fee, net);

  return charge;
}

async function persistChargeToMysql(
  charge: PaymentCharge,
  input: CreateChargeViaVelanaInput,
  providerId: string,
  mappedStatus: string,
  fee: number,
  net: number
) {
  const { prisma, isDatabaseConfigured } = await import(
    "@/lib/server/prisma"
  );
  if (!isDatabaseConfigured()) {
    throw new VelanaError("Banco indisponível para gravar cobrança", {
      code: "DB_UNAVAILABLE",
    });
  }

  const txLocalId = charge.transactionId || `TX-VL-${Date.now()}`;

  const user = await prisma.user.findUnique({
    where: { id: input.sellerId },
  });
  if (!user) {
    throw new VelanaError("Seller não encontrado para gravar cobrança", {
      code: "SELLER_NOT_FOUND",
    });
  }

  const chargeDbId =
    providerId.length <= 60
      ? `vl_${providerId}`
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
        description: input.description || "Cobrança PIX Velana",
        method: "PIX",
        amount: charge.amount,
        feeAmount: fee,
        netAmount: net,
        platformFee: fee,
        status: mappedStatus === "aprovada" ? "aprovada" : "pendente",
        customer: input.customerName,
        customerDocument: charge.customerDocument,
        product: input.description,
        acquirerId: "velana",
        provider: "velana",
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
        provider: "velana",
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

export async function createWithdrawalViaVelana(
  sellerId: string,
  sellerName: string,
  input: CreateWithdrawalInput,
  opts?: { config?: VelanaConfig | null; skipLocalDebit?: boolean }
): Promise<Withdrawal> {
  const config =
    opts?.config ??
    (typeof window === "undefined"
      ? await resolveVelanaConfigServer()
      : resolveVelanaConfig());

  if (!config?.secretKey) {
    throw new VelanaError("Velana não configurada", {
      code: "VELANA_NOT_CONFIGURED",
    });
  }

  const amountCents = toCents(input.amount);
  if (amountCents < 100) {
    throw new VelanaError("Valor mínimo Velana: R$ 1,00", {
      code: "MIN_AMOUNT",
    });
  }

  const postback = config.postbackBaseUrl
    ? `${config.postbackBaseUrl.replace(/\/$/, "")}/api/v1/webhooks/velana`
    : undefined;

  const remote = await velanaClient.createTransfer(
    {
      amount: amountCents,
      pixKey: input.pixKey.trim(),
      postbackUrl: postback,
    },
    { config }
  );

  const w: Withdrawal = {
    id: String(remote.id),
    sellerId,
    sellerName,
    date: remote.createdAt || new Date().toISOString(),
    amount: fromCents(remote.amount ?? amountCents),
    method: "PIX",
    destination: input.pixKey.trim(),
    status: mapVelanaTransferStatus(remote.status),
    feePercent: 0,
    feeFixed: fromCents(remote.fee ?? 0),
  };

  // Debito local só se o caller ainda não debitou atomicamente no DB
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
    description: "Saque PIX Velana",
    method: "PIX",
    amount: w.amount,
    status: w.status,
  });

  return w;
}

export async function syncBalanceFromVelana(sellerId: string) {
  const config = await resolveVelanaConfigServer();
  if (!config?.secretKey) return null;
  const remote = await velanaClient.getAvailableBalance(config);
  const mapped = {
    available: fromCents(remote.amount ?? 0),
    pending: 0,
    held: 0,
  };
  const store = getStore();
  store.balances[sellerId] = mapped;
  return mapped;
}

/**
 * Consulta status real na Velana e espelha no DarkPay (DB + memória).
 */
export async function syncChargeFromVelana(
  chargeOrProviderId: string,
  sellerId?: string
): Promise<PaymentCharge> {
  const config = await resolveVelanaConfigServer();
  if (!config?.secretKey) {
    throw new VelanaError("Velana não configurada", {
      code: "VELANA_NOT_CONFIGURED",
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
        ],
        ...(sellerId ? { sellerId } : {}),
        provider: "velana",
      },
    });
    if (row) {
      providerId = row.providerId || row.id.replace(/^vl_/, "");
      chargeDbId = row.id;
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
  }

  if (!providerId && !local) {
    // tenta sem filtro de provider (id numérico Velana)
    if (isDatabaseConfigured()) {
      const row = await prisma.paymentCharge.findFirst({
        where: {
          OR: [
            { id: chargeOrProviderId },
            { providerId: chargeOrProviderId },
            { transactionId: chargeOrProviderId },
          ],
          ...(sellerId ? { sellerId } : {}),
        },
      });
      if (row) {
        providerId = row.providerId || row.id.replace(/^vl_/, "");
        chargeDbId = row.id;
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
    }
  }

  if (!providerId && !local) {
    throw new VelanaError("Cobrança não encontrada", { code: "NOT_FOUND" });
  }

  const remoteId = String(providerId || local?.id || chargeOrProviderId).replace(/^vl_/, "");
  const remote = await velanaClient.getTransaction(remoteId, config);
  const mapped = mapVelanaTxStatus(remote.status);
  const now = new Date().toISOString();

  const nextStatus: PaymentCharge["status"] =
    mapped === "aprovada"
      ? "paid"
      : mapped === "recusada"
        ? "cancelled"
        : mapped === "reembolsada"
          ? "refunded"
          : "waiting_payment";

  if (local) {
    const wasWaiting = local.status === "waiting_payment";
    local.status = nextStatus;
    if (nextStatus === "paid" && !local.paidAt) {
      local.paidAt = now;
      if (wasWaiting) {
        let fee = computeVelanaSellerFee(local.amount);
        try {
          const { getSellerSaleFees, computeSaleFeeAmount } = await import(
            "@/lib/server/seller-fees"
          );
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
    }
    if (local.transactionId) {
      const tx = local.transactionId ? store.transactions.find((t) => t.id === local.transactionId) : undefined;
      if (tx) {
        tx.status =
          mapped === "aprovada"
            ? "aprovada"
            : mapped === "recusada"
              ? "recusada"
              : mapped === "reembolsada"
                ? "reembolsada"
                : "pendente";
      }
    }
    if (local && !store.charges.some((c) => c.id === local.id)) {
      store.charges.unshift(local);
    }
  }

  if (isDatabaseConfigured() && (chargeDbId || remoteId)) {
    await applyPaidStatusToMysql({
      providerId: remoteId,
      chargeId: chargeDbId,
      mapped,
      sellerId: local?.sellerId || sellerId,
    });
  }

  if (!local) {
    throw new VelanaError("Cobrança não encontrada localmente", {
      code: "NOT_FOUND",
    });
  }

  return local;
}

async function applyPaidStatusToMysql(opts: {
  providerId: string;
  chargeId?: string;
  mapped: string;
  sellerId?: string;
}) {
  const { prisma } = await import("@/lib/server/prisma");
  const statusTx =
    opts.mapped === "aprovada"
      ? "aprovada"
      : opts.mapped === "recusada"
        ? "recusada"
        : opts.mapped === "reembolsada"
          ? "reembolsada"
          : "pendente";
  const statusCharge =
    opts.mapped === "aprovada"
      ? "paid"
      : opts.mapped === "reembolsada"
        ? "refunded"
        : opts.mapped === "recusada"
          ? "cancelled"
          : "waiting_payment";

  const charge = await prisma.paymentCharge.findFirst({
    where: {
      OR: [
        ...(opts.chargeId ? [{ id: opts.chargeId }] : []),
        { providerId: opts.providerId },
        { id: `vl_${opts.providerId}` },
      ],
    },
  });
  if (!charge) return;

  const tx = charge.transactionId
    ? await prisma.transaction.findUnique({
        where: { id: charge.transactionId },
      })
    : await prisma.transaction.findFirst({
        where: { providerId: opts.providerId },
      });

  // Crédito atômico + idempotente (fonte da verdade: DB)
  if (statusCharge === "paid") {
    const { creditPaidSaleIdempotent, notifyUtmifyAfterPaid } = await import(
      "@/lib/server/balance"
    );
    const amount = Number(charge.amount);
    // Sempre aplica MDR da conta do seller no momento do pagamento
    let fee = 0;
    try {
      const { getSellerSaleFees, computeSaleFeeAmount } = await import(
        "@/lib/server/seller-fees"
      );
      const plan = await getSellerSaleFees(charge.sellerId);
      fee = computeSaleFeeAmount(amount, plan);
    } catch {
      fee = tx
        ? Number(tx.feeAmount)
        : computeVelanaSellerFee(amount);
    }
    // Atualiza fee/net na TX se ainda estiver pendente (exibe líquido correto)
    if (tx?.id && Number(tx.feeAmount) !== fee) {
      try {
        const net = Math.max(0, Math.round((amount - fee) * 100) / 100);
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { feeAmount: fee, netAmount: net, platformFee: fee },
        });
      } catch {
        /* best-effort */
      }
    }
    const credit = await creditPaidSaleIdempotent({
      transactionId: tx?.id,
      providerId: opts.providerId,
      provider: "velana",
      sellerId: charge.sellerId,
      amount,
      feeAmount: fee,
    });
    if (credit.credited) {
      let meta: Record<string, unknown> | null = null;
      try {
        meta =
          charge.metadata && typeof charge.metadata === "object"
            ? (charge.metadata as Record<string, unknown>)
            : null;
      } catch {
        meta = null;
      }
      await notifyUtmifyAfterPaid({
        sellerId: charge.sellerId,
        orderId: charge.id,
        amount,
        feeAmount: fee,
        description: charge.description || tx?.description,
        customerName: charge.customerName || tx?.customer,
        customerEmail: tx?.customerEmail,
        customerDocument: charge.customerDocument || tx?.customerDocument,
        metadata: meta,
        createdAt: charge.createdAt,
      });
    }
    return;
  }

  if (tx && statusTx === "recusada") {
    const { rejectPendingSaleIdempotent } = await import(
      "@/lib/server/balance"
    );
    await rejectPendingSaleIdempotent({
      transactionId: tx.id,
      sellerId: charge.sellerId,
      amount: Number(charge.amount),
      providerId: opts.providerId,
      chargeStatus: "cancelled",
    });
    return;
  }

  if (tx && statusTx === "reembolsada") {
    const { refundSaleIdempotent } = await import("@/lib/server/balance");
    await refundSaleIdempotent({
      transactionId: tx.id,
      sellerId: charge.sellerId,
      amount: Number(tx.amount),
      feeAmount: Number(tx.feeAmount),
      netAmount: Number(tx.netAmount),
      providerId: opts.providerId,
    });
    return;
  }

  if (statusCharge !== "waiting_payment") {
    await prisma.paymentCharge.updateMany({
      where: {
        id: charge.id,
        status: "waiting_payment",
      },
      data: {
        status: statusCharge,
      },
    });
  }
}

/**
 * Processa postback Velana e atualiza store local.
 * Formato: { type: "transaction"|"transfer"|"checkout", data: {...} }
 */
export function applyVelanaWebhook(payload: VelanaPostbackPayload): {
  ok: boolean;
  message: string;
} {
  const store = getStore();
  const type = String(payload.type || "").toLowerCase();
  const data = payload.data || {};

  if (type === "transaction" || data.status != null) {
    const remoteId = String(data.id || payload.objectId || "");
    const status = String(data.status || "");
    const mapped = mapVelanaTxStatus(status);

    const charge = store.charges.find(
      (c) => c.id === remoteId || c.id === `vl_${remoteId}`
    );
    if (charge) {
      if (mapped === "aprovada" && charge.status !== "paid") {
        const wasWaiting = charge.status === "waiting_payment";
        charge.status = "paid";
        charge.paidAt = new Date().toISOString();
        if (wasWaiting) {
          const fee = computeVelanaSellerFee(charge.amount);
          const net = Math.max(0, Math.round((charge.amount - fee) * 100) / 100);
          adjustBalance(charge.sellerId, { pending: -charge.amount, available: net });
        }
      } else if (mapped === "recusada" && charge.status === "waiting_payment") {
        charge.status = "cancelled";
      } else if (mapped === "reembolsada") {
        charge.status = "refunded";
      }

      if (charge.transactionId) {
        const tx = store.transactions.find((t) => t.id === charge.transactionId);
        if (tx) tx.status = mapped;
      }
    }

    return { ok: true, message: `transaction ${remoteId} → ${mapped}` };
  }

  if (type === "transfer") {
    const remoteId = String(data.id || payload.objectId || "");
    const status = String(data.status || "");
    const mapped = mapVelanaTransferStatus(status);
    const w = store.withdrawals.find((x) => x.id === remoteId);
    if (w) {
      const prev = w.status;
      w.status = mapped;
      if (mapped === "recusado" && prev === "processando") {
        adjustBalance(w.sellerId, { available: w.amount });
      }
      const tx = store.transactions.find((t) => t.id === w.id);
      if (tx) tx.status = mapped;
    }
    return { ok: true, message: `transfer ${remoteId} → ${mapped}` };
  }

  if (type === "checkout") {
    const txData = (data.transaction || data) as Record<string, unknown>;
    if (txData && txData.id) {
      return applyVelanaWebhook({
        type: "transaction",
        objectId: String(txData.id),
        data: txData,
      });
    }
  }

  return { ok: true, message: `evento ignorado: ${type}` };
}
