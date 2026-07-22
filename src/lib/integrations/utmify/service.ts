/**
 * Integração UTMify no DarkPay:
 * - Token por seller em `integration_utmify`
 * - Envio de vendas (PIX gerado / pago / recusado / reembolso)
 * Docs: https://docs.utmify.com.br/envio-de-vendas
 */

import { randomBytes } from "crypto";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import {
  formatUtmifyUtc,
  reaisToCents,
  sendUtmifyOrder,
  UTMIFY_PLATFORM_NAME,
} from "./client";
import type {
  UtmifyOrderPayload,
  UtmifyOrderStatus,
  UtmifySendResult,
  UtmifyTrackingParameters,
} from "./types";

export type UtmifyConnectionDto = {
  active: boolean;
  hasToken: boolean;
  tokenMasked: string | null;
  connectedAt: string | null;
};

function maskToken(token: string): string {
  const t = token.trim();
  if (t.length <= 12) return "•".repeat(Math.min(t.length, 8));
  return `${t.slice(0, 6)}${"•".repeat(10)}${t.slice(-4)}`;
}

function emptyTracking(): UtmifyTrackingParameters {
  return {
    src: null,
    sck: null,
    utm_source: null,
    utm_campaign: null,
    utm_medium: null,
    utm_content: null,
    utm_term: null,
  };
}

/** Extrai UTMs de metadata da cobrança / query */
export function trackingFromMetadata(
  meta: Record<string, unknown> | null | undefined
): UtmifyTrackingParameters {
  const base = emptyTracking();
  if (!meta || typeof meta !== "object") return base;
  const get = (k: string) => {
    const v = meta[k] ?? meta[k.toLowerCase()] ?? meta[k.toUpperCase()];
    if (v == null || v === "") return null;
    return String(v).slice(0, 500);
  };
  return {
    src: get("src"),
    sck: get("sck"),
    utm_source: get("utm_source") || get("utmSource"),
    utm_campaign: get("utm_campaign") || get("utmCampaign"),
    utm_medium: get("utm_medium") || get("utmMedium"),
    utm_content: get("utm_content") || get("utmContent"),
    utm_term: get("utm_term") || get("utmTerm"),
  };
}

export async function getUtmifyConnection(
  sellerId: string
): Promise<UtmifyConnectionDto> {
  if (!isDatabaseConfigured()) {
    return {
      active: false,
      hasToken: false,
      tokenMasked: null,
      connectedAt: null,
    };
  }
  const row = await prisma.integrationUtmify.findUnique({
    where: { userId: sellerId },
  });
  if (!row?.apiToken) {
    return {
      active: false,
      hasToken: false,
      tokenMasked: null,
      connectedAt: null,
    };
  }
  return {
    active: row.active,
    hasToken: true,
    tokenMasked: maskToken(row.apiToken),
    connectedAt: row.updatedAt?.toISOString?.() ?? row.createdAt.toISOString(),
  };
}

export async function saveUtmifyToken(
  sellerId: string,
  apiToken: string
): Promise<UtmifyConnectionDto> {
  if (!isDatabaseConfigured()) {
    throw new Error("Banco indisponível");
  }
  const token = apiToken.trim();
  if (token.length < 8) {
    throw new Error("Token inválido");
  }

  const existing = await prisma.integrationUtmify.findUnique({
    where: { userId: sellerId },
  });

  const row = existing
    ? await prisma.integrationUtmify.update({
        where: { userId: sellerId },
        data: { apiToken: token, active: true },
      })
    : await prisma.integrationUtmify.create({
        data: {
          id: `utm_${randomBytes(10).toString("hex")}`,
          userId: sellerId,
          apiToken: token,
          active: true,
        },
      });

  return {
    active: row.active,
    hasToken: true,
    tokenMasked: maskToken(token),
    connectedAt: row.updatedAt.toISOString(),
  };
}

export async function disconnectUtmify(
  sellerId: string
): Promise<UtmifyConnectionDto> {
  if (!isDatabaseConfigured()) {
    return {
      active: false,
      hasToken: false,
      tokenMasked: null,
      connectedAt: null,
    };
  }
  const existing = await prisma.integrationUtmify.findUnique({
    where: { userId: sellerId },
  });
  if (existing) {
    await prisma.integrationUtmify.update({
      where: { userId: sellerId },
      data: { active: false, apiToken: null },
    });
  }
  return {
    active: false,
    hasToken: false,
    tokenMasked: null,
    connectedAt: null,
  };
}

async function getActiveToken(sellerId: string): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  const row = await prisma.integrationUtmify.findUnique({
    where: { userId: sellerId },
  });
  if (!row?.active || !row.apiToken?.trim()) return null;
  return row.apiToken.trim();
}

export type PushUtmifySaleInput = {
  sellerId: string;
  orderId: string;
  status: UtmifyOrderStatus;
  amount: number;
  /** taxa gateway/plataforma em R$ */
  feeAmount?: number;
  /** líquido do seller em R$ */
  netAmount?: number;
  description?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerDocument?: string | null;
  customerPhone?: string | null;
  customerIp?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
  approvedDate?: Date | string | null;
  refundedAt?: Date | string | null;
  isTest?: boolean;
};

/**
 * Envia/atualiza venda na UTMify (fire-and-forget seguro).
 * Não lança — loga falhas. Use `await` se precisar do resultado (teste).
 */
export async function pushSaleToUtmify(
  input: PushUtmifySaleInput
): Promise<UtmifySendResult | { ok: false; skipped: true; reason: string }> {
  try {
    const token = await getActiveToken(input.sellerId);
    if (!token) {
      return { ok: false, skipped: true, reason: "utmify_not_connected" };
    }

    const totalCents = reaisToCents(input.amount);
    const feeCents = reaisToCents(input.feeAmount ?? 0);
    let userCents = reaisToCents(
      input.netAmount != null
        ? input.netAmount
        : Math.max(0, input.amount - (input.feeAmount ?? 0))
    );
    // UTMify: userCommissionInCents não pode ser 0 (exceto se realmente zero)
    if (userCents <= 0 && totalCents > 0) {
      userCents = totalCents;
    }

    const createdAt =
      formatUtmifyUtc(input.createdAt) ||
      formatUtmifyUtc(new Date()) ||
      "1970-01-01 00:00:00";
    const approvedDate =
      input.status === "paid" || input.status === "refunded"
        ? formatUtmifyUtc(input.approvedDate || input.createdAt)
        : null;
    const refundedAt =
      input.status === "refunded"
        ? formatUtmifyUtc(input.refundedAt || new Date())
        : null;

    const productName =
      (input.description || "").trim() || "Venda Dark Pay";
    const productId = input.orderId;

    const payload: UtmifyOrderPayload = {
      orderId: input.orderId,
      platform: UTMIFY_PLATFORM_NAME,
      paymentMethod: "pix",
      status: input.status,
      createdAt,
      approvedDate,
      refundedAt,
      customer: {
        name: (input.customerName || "Cliente").slice(0, 120),
        email: (input.customerEmail || "cliente@darkpays.online").slice(0, 160),
        phone: input.customerPhone
          ? String(input.customerPhone).replace(/\D/g, "").slice(0, 20) || null
          : null,
        document: input.customerDocument
          ? String(input.customerDocument).replace(/\D/g, "").slice(0, 20) ||
            null
          : null,
        country: "BR",
        ...(input.customerIp ? { ip: input.customerIp } : {}),
      },
      products: [
        {
          id: productId,
          name: productName.slice(0, 200),
          planId: null,
          planName: null,
          quantity: 1,
          priceInCents: totalCents,
        },
      ],
      trackingParameters: trackingFromMetadata(input.metadata),
      commission: {
        totalPriceInCents: totalCents,
        gatewayFeeInCents: feeCents,
        userCommissionInCents: userCents,
        currency: "BRL",
      },
      ...(input.isTest ? { isTest: true } : {}),
    };

    const result = await sendUtmifyOrder(token, payload);
    if (!result.ok) {
      console.warn(
        `[utmify] falha orderId=${input.orderId} status=${input.status}:`,
        result.error
      );
    }
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro utmify";
    console.warn("[utmify] exception", msg);
    return { ok: false, status: 0, error: msg };
  }
}

/** Dispara em background (não atrasa resposta da API de pagamento). */
export function pushSaleToUtmifyBackground(
  input: PushUtmifySaleInput
): void {
  void pushSaleToUtmify(input);
}

/**
 * Teste de conexão: envia pedido isTest=true (validação UTMify, sem gravar venda).
 */
export async function testUtmifyConnection(
  sellerId: string,
  tokenOverride?: string
): Promise<UtmifySendResult> {
  let token = tokenOverride?.trim() || null;
  if (!token) {
    token = await getActiveToken(sellerId);
  }
  if (!token) {
    return { ok: false, status: 0, error: "Conecte um token primeiro" };
  }

  const now = new Date();
  const orderId = `test_darkpay_${Date.now()}`;
  const createdAt = formatUtmifyUtc(now) || "1970-01-01 00:00:00";

  return sendUtmifyOrder(token, {
    orderId,
    platform: UTMIFY_PLATFORM_NAME,
    paymentMethod: "pix",
    status: "waiting_payment",
    createdAt,
    approvedDate: null,
    refundedAt: null,
    customer: {
      name: "Teste DarkPay",
      email: "teste@darkpays.online",
      phone: null,
      document: null,
      country: "BR",
    },
    products: [
      {
        id: "test-product",
        name: "Teste integração DarkPay",
        planId: null,
        planName: null,
        quantity: 1,
        priceInCents: 100,
      },
    ],
    trackingParameters: emptyTracking(),
    commission: {
      totalPriceInCents: 100,
      gatewayFeeInCents: 0,
      userCommissionInCents: 100,
      currency: "BRL",
    },
    isTest: true,
  });
}
