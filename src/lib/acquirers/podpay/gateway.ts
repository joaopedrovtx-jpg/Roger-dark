/**
 * Gateway PodPay → domínio DarkPay (memory-store).
 * Usado quando PODPAY_API_KEY / config local está definida.
 * Sem chave, os services continuam no mock local.
 */

import { randomBytes } from "crypto";
import {
  adjustBalance,
  getStore,
  pushCharge,
  pushTransaction,
  pushWithdrawal,
  setBrandingInStore,
  type PaymentCharge,
} from "@/lib/server/memory-store";
import type { CreateWithdrawalInput, Withdrawal } from "@/lib/domain/types";
import { podpayClient, PodPayError } from "./client";
import {
  computePodPaySellerFee,
  isPodPayEnabled,
  resolvePodPayConfig,
  resolvePodPayConfigServer,
} from "./config";
import {
  detectPixKeyType,
  fromCents,
  mapPodPayBalance,
  mapPodPayTxStatus,
  mapPodPayWithdrawalStatus,
  onlyDigits,
  toCents,
} from "./mappers";
import type {
  PodPayConfig,
  PodPayCreateTransaction,
  PodPayWebhookPayload,
} from "./types";

export { isPodPayEnabled };

export interface CreateChargeViaPodPayInput {
  sellerId: string;
  amount: number; // reais
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerDocument?: string; // cpf/cnpj dígitos
  documentType?: "cpf" | "cnpj";
  tangible?: boolean;
  postbackUrl?: string;
  /** config forçada (ex.: chave do MySQL admin) */
  config?: PodPayConfig | null;
}

export async function createChargeViaPodPay(
  input: CreateChargeViaPodPayInput
): Promise<PaymentCharge> {
  const config =
    input.config ??
    (typeof window === "undefined"
      ? await resolvePodPayConfigServer()
      : resolvePodPayConfig());

  if (!config?.apiKey) {
    throw new PodPayError(
      "PodPay não configurada. Salve a chave privada em Admin → Adquirentes → Credenciais (PodPay) ou PODPAY_API_KEY no .env",
      { code: "PODPAY_NOT_CONFIGURED" }
    );
  }

  const doc = onlyDigits(input.customerDocument || "00000000000");
  const docType =
    input.documentType || (doc.length > 11 ? "cnpj" : "cpf");

  const amountCents = toCents(input.amount);
  if (amountCents < 100) {
    throw new PodPayError("Valor mínimo PodPay: R$ 1,00", {
      code: "MIN_AMOUNT",
    });
  }

  const postback =
    input.postbackUrl ||
    (config.postbackBaseUrl
      ? `${config.postbackBaseUrl.replace(/\/$/, "")}/api/v1/webhooks/podpay`
      : undefined);

  const dto: PodPayCreateTransaction = {
    paymentMethod: "pix",
    amount: amountCents,
    customer: {
      name: input.customerName || "Cliente",
      email: input.customerEmail || "cliente@email.com",
      phone: onlyDigits(input.customerPhone || "11999999999"),
      document: { type: docType, number: doc || "00000000000" },
    },
    items: [
      {
        title: input.description || "Pagamento",
        unitPrice: amountCents,
        quantity: 1,
        tangible: input.tangible ?? false,
      },
    ],
    postbackUrl: postback,
  };

  const remote = await podpayClient.createTransaction(dto, { config });
  const store = getStore();
  const now = new Date().toISOString();
  const mapped = mapPodPayTxStatus(remote.status);

  // PodPay: pixQrCode costuma ser o EMV (copia-e-cola); pixQrCodeImage é a imagem
  const emv =
    (remote.pixQrCode && String(remote.pixQrCode).startsWith("000201")
      ? remote.pixQrCode
      : null) ||
    (typeof remote.pixQrCode === "string" &&
    !remote.pixQrCode.startsWith("data:") &&
    !remote.pixQrCode.startsWith("http")
      ? remote.pixQrCode
      : null) ||
    "";

  let qrImage =
    remote.pixQrCodeImage ||
    (remote.pixQrCode?.startsWith("data:") ||
    remote.pixQrCode?.startsWith("http")
      ? remote.pixQrCode
      : undefined);

  // Gera QR visual a partir do EMV se a adquirente não mandou imagem
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

  const charge: PaymentCharge = {
    id: remote.id,
    sellerId: input.sellerId,
    amount: fromCents(remote.amount ?? amountCents),
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
    customerDocument: doc,
    pixCopyPaste: emv || remote.pixQrCode || undefined,
    pixQrCode: qrImage || undefined,
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    createdAt: remote.createdAt || now,
    paidAt: mapped === "aprovada" ? now : undefined,
  };

  // TX local + MySQL
  const txId = `TX-PP-${Date.now().toString().slice(-8)}`;
  charge.transactionId = txId;
  pushCharge(charge);
  pushTransaction({
    id: txId,
    date: charge.createdAt,
    sellerId: input.sellerId,
    kind: "venda",
    direction: "entrada",
    description: input.description || "Cobrança PIX PodPay",
    method: "PIX",
    amount: charge.amount,
    status: mapped,
    customer: input.customerName,
    product: input.description,
  });

  if (charge.status === "waiting_payment") {
    adjustBalance(input.sellerId, { pending: charge.amount });
  } else if (charge.status === "paid") {
    const fee = computePodPaySellerFee(charge.amount);
    const net = Math.max(0, Math.round((charge.amount - fee) * 100) / 100);
    adjustBalance(input.sellerId, { available: net });
  }

  // Persistência obrigatória no MySQL
  await persistChargeToMysql(charge, input, remote.id, mapped);

  return charge;
}

async function persistChargeToMysql(
  charge: PaymentCharge,
  input: CreateChargeViaPodPayInput,
  providerId: string,
  mappedStatus: string
) {
  const { prisma, isDatabaseConfigured } = await import(
    "@/lib/server/prisma"
  );
  if (!isDatabaseConfigured()) {
    throw new Error("Banco indisponível para gravar cobrança PodPay");
  }

  const fee = computePodPaySellerFee(charge.amount);
  const net = Math.max(0, Math.round((charge.amount - fee) * 100) / 100);
  const txLocalId = charge.transactionId || `TX-PP-${Date.now()}`;

  const user = await prisma.user.findUnique({
    where: { id: input.sellerId },
  });
  if (!user) {
    throw new Error("Seller não encontrado para gravar cobrança PodPay");
  }

  const chargeDbId =
    providerId.length <= 60
      ? `pp_${providerId}`
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
        description: input.description || "Cobrança PIX PodPay",
        method: "PIX",
        amount: charge.amount,
        feeAmount: fee,
        netAmount: net,
        platformFee: fee,
        status: mappedStatus === "aprovada" ? "aprovada" : "pendente",
        customer: input.customerName,
        customerDocument: charge.customerDocument,
        product: input.description,
        acquirerId: "podpay",
        provider: "podpay",
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
        provider: "podpay",
        providerId,
      },
    });

    if (mappedStatus === "pendente" || charge.status === "waiting_payment") {
      await db.user.update({
        where: { id: input.sellerId },
        data: { balancePending: { increment: charge.amount } },
      });
    }
  });
}

export async function createWithdrawalViaPodPay(
  sellerId: string,
  sellerName: string,
  input: CreateWithdrawalInput,
  opts?: { skipLocalDebit?: boolean }
): Promise<Withdrawal> {
  if (!isPodPayEnabled()) {
    throw new PodPayError("PodPay não configurada", {
      code: "PODPAY_NOT_CONFIGURED",
    });
  }

  const amountCents = toCents(input.amount);
  if (amountCents < 100) {
    throw new PodPayError("Valor mínimo PodPay: R$ 1,00", {
      code: "MIN_AMOUNT",
    });
  }

  const remote = await podpayClient.createWithdrawal({
    method: "fiat",
    amount: amountCents,
    netPayout: true,
    pixKey: input.pixKey.trim(),
    pixKeyType: detectPixKeyType(input.pixKey),
  });

  const w: Withdrawal = {
    id: remote.id,
    sellerId,
    sellerName,
    date: remote.createdAt || new Date().toISOString(),
    amount: fromCents(remote.amount ?? amountCents),
    method: "PIX",
    destination: input.pixKey.trim(),
    status: mapPodPayWithdrawalStatus(remote.status),
    feePercent: 0,
    feeFixed: fromCents(remote.fee ?? 0),
  };

  // Debita localmente se ainda processando (e se o caller não debitou no DB)
  if (w.status === "processando" && !opts?.skipLocalDebit) {
    adjustBalance(sellerId, { available: -w.amount });
  }

  pushWithdrawal(w);
  pushTransaction({
    id: w.id,
    date: w.date,
    sellerId,
    sellerName,
    kind: "saque",
    direction: "saida",
    description: "Saque PIX PodPay",
    method: "PIX",
    amount: w.amount,
    status: w.status,
  });

  return w;
}

export async function syncBalanceFromPodPay(sellerId: string) {
  if (!isPodPayEnabled()) return null;
  const remote = await podpayClient.getAvailableBalance();
  const mapped = mapPodPayBalance(remote);
  const store = getStore();
  store.balances[sellerId] = mapped;
  return mapped;
}

/**
 * Consulta status real na PodPay e espelha no DarkPay (DB + memória).
 * Essencial em localhost (webhook externo não chega) e como fallback do postback.
 */
export async function syncChargeFromPodPay(
  chargeOrProviderId: string,
  sellerId?: string
): Promise<PaymentCharge> {
  const config = await resolvePodPayConfigServer();
  if (!config?.apiKey) {
    throw new PodPayError("PodPay não configurada", {
      code: "PODPAY_NOT_CONFIGURED",
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
      },
    });
    if (row) {
      providerId = row.providerId || row.id.replace(/^pp_/, "");
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
    throw new PodPayError("Cobrança não encontrada", { code: "NOT_FOUND" });
  }

  const remoteId = (providerId || local?.id || chargeOrProviderId).replace(/^pp_/, "");
  const remote = await podpayClient.getTransaction(remoteId, config);
  const mapped = mapPodPayTxStatus(remote.status);
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
        const fee = computePodPaySellerFee(local.amount);
        const net = Math.max(0, Math.round((local.amount - fee) * 100) / 100);
        adjustBalance(local.sellerId, {
          pending: -local.amount,
          available: net,
        });
      }
      // sem wasWaiting: não credita duas vezes; o credit no DB
      // (creditPaidSaleIdempotent) é idempotente e fonte da verdade.
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
    // ensure in store
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
    throw new PodPayError("Cobrança não encontrada localmente", {
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
        { id: `pp_${opts.providerId}` },
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
    const fee = tx
      ? Number(tx.feeAmount)
      : computePodPaySellerFee(amount);
    const credit = await creditPaidSaleIdempotent({
      transactionId: tx?.id,
      providerId: opts.providerId,
      provider: "podpay",
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
 * Processa webhook PodPay e atualiza store local.
 *
 * NOTA: este mirror em memória é cache de leitura. O saldo canônico é o DB
 * via creditPaidSaleIdempotent. Aqui só atualizamos o status (para a UI
 * reativa refletir rápido). Qualquer ajuste de saldo em produção deve ir
 * pelo DB.
 */
export function applyPodPayWebhook(payload: PodPayWebhookPayload): {
  ok: boolean;
  message: string;
} {
  const store = getStore();
  const event = String(payload.event || "");
  const data = payload.data || {};

  if (event.startsWith("transaction.")) {
    const remoteId = String(data.id || data.transactionId || "");
    const status = String(data.status || "");
    const mapped = mapPodPayTxStatus(status);

    // Atualiza charge (mirror). Saldo canônico fica no DB.
    const charge = store.charges.find((c) => c.id === remoteId);
    if (charge) {
      const wasWaiting = charge.status === "waiting_payment";
      if (mapped === "aprovada" && charge.status !== "paid") {
        charge.status = "paid";
        charge.paidAt = payload.timestamp || new Date().toISOString();
        if (wasWaiting) {
          const fee = computePodPaySellerFee(charge.amount);
          const net = Math.max(0, Math.round((charge.amount - fee) * 100) / 100);
          void net;
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

  if (event.startsWith("withdrawal.")) {
    const remoteId = String(data.id || data.withdrawalId || "");
    const status = String(data.status || "");
    const mapped = mapPodPayWithdrawalStatus(status);
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
    return { ok: true, message: `withdrawal ${remoteId} → ${mapped}` };
  }

  return { ok: true, message: `evento ignorado: ${event}` };
}
