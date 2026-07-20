/**
 * Cliente HTTP PodPay
 * Docs: https://docs.podpay.app/
 * Auth: header x-api-key: sk_live_* | sk_test_*
 * Valores em CENTAVOS
 */

import type {
  PodPayApiResponse,
  PodPayBalance,
  PodPayCheckoutApplyCouponRequest,
  PodPayCheckoutApplyCouponResponse,
  PodPayCheckoutCreateSessionRequest,
  PodPayCheckoutPayRequest,
  PodPayCheckoutPayResponse,
  PodPayCheckoutSessionCreated,
  PodPayConfig,
  PodPayCreateTransaction,
  PodPayCreateWithdrawal,
  PodPayTransaction,
  PodPayWithdrawal,
} from "./types";
import { resolvePodPayConfig } from "./config";

export class PodPayError extends Error {
  code?: string;
  status?: number;
  details?: unknown;

  constructor(
    message: string,
    opts?: { code?: string; status?: number; details?: unknown }
  ) {
    super(message);
    this.name = "PodPayError";
    this.code = opts?.code;
    this.status = opts?.status;
    this.details = opts?.details;
  }
}

function randomIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

async function podpayFetch<T>(
  path: string,
  init?: RequestInit & {
    config?: PodPayConfig | null;
    idempotency?: boolean;
  }
): Promise<T> {
  const config = init?.config ?? resolvePodPayConfig();
  if (!config?.apiKey) {
    throw new PodPayError(
      "PodPay não configurada. Defina PODPAY_API_KEY ou salve a chave em Integrações.",
      { code: "PODPAY_NOT_CONFIGURED" }
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey,
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (init?.idempotency && !headers["X-Idempotency-Key"]) {
    headers["X-Idempotency-Key"] = randomIdempotencyKey();
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers,
  });

  let body: PodPayApiResponse<T> | null = null;
  try {
    body = (await res.json()) as PodPayApiResponse<T>;
  } catch {
    /* ignore */
  }

  if (!res.ok || body?.success === false) {
    const err = body?.error;
    throw new PodPayError(
      err?.message || `PodPay HTTP ${res.status}`,
      {
        code: err?.code,
        status: res.status,
        details: err?.details ?? body,
      }
    );
  }

  return (body?.data ?? body) as T;
}

export const podpayClient = {
  isConfigured(): boolean {
    return !!resolvePodPayConfig()?.apiKey;
  },

  getConfig(): PodPayConfig | null {
    return resolvePodPayConfig();
  },

  /** POST /v1/transactions criar cobrança PIX/cartão/boleto */
  createTransaction(
    dto: PodPayCreateTransaction,
    opts?: { idempotencyKey?: string; config?: PodPayConfig }
  ): Promise<PodPayTransaction> {
    return podpayFetch<PodPayTransaction>("/v1/transactions", {
      method: "POST",
      body: JSON.stringify(dto),
      config: opts?.config,
      idempotency: true,
      headers: opts?.idempotencyKey
        ? { "X-Idempotency-Key": opts.idempotencyKey }
        : undefined,
    });
  },

  listTransactions(params?: {
    page?: number;
    pageSize?: number;
    status?: string;
    config?: PodPayConfig;
  }): Promise<unknown> {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return podpayFetch(`/v1/transactions${qs ? `?${qs}` : ""}`, {
      config: params?.config,
    });
  },

  getTransaction(
    id: string,
    config?: PodPayConfig
  ): Promise<PodPayTransaction> {
    return podpayFetch<PodPayTransaction>(
      `/v1/transactions/${encodeURIComponent(id)}`,
      { config }
    );
  },

  refundTransaction(
    id: string,
    config?: PodPayConfig
  ): Promise<PodPayTransaction> {
    return podpayFetch<PodPayTransaction>(
      `/v1/transactions/${encodeURIComponent(id)}/refund`,
      { method: "POST", config, idempotency: true }
    );
  },

  createWithdrawal(
    dto: PodPayCreateWithdrawal,
    opts?: { idempotencyKey?: string; config?: PodPayConfig }
  ): Promise<PodPayWithdrawal> {
    return podpayFetch<PodPayWithdrawal>("/v1/withdrawals", {
      method: "POST",
      body: JSON.stringify(dto),
      config: opts?.config,
      idempotency: true,
      headers: opts?.idempotencyKey
        ? { "X-Idempotency-Key": opts.idempotencyKey }
        : undefined,
    });
  },

  listWithdrawals(params?: {
    page?: number;
    status?: string;
    config?: PodPayConfig;
  }): Promise<unknown> {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return podpayFetch(`/v1/withdrawals${qs ? `?${qs}` : ""}`, {
      config: params?.config,
    });
  },

  getWithdrawal(
    id: string,
    config?: PodPayConfig
  ): Promise<PodPayWithdrawal> {
    return podpayFetch<PodPayWithdrawal>(
      `/v1/withdrawals/${encodeURIComponent(id)}`,
      { config }
    );
  },

  cancelWithdrawal(
    id: string,
    config?: PodPayConfig
  ): Promise<PodPayWithdrawal> {
    return podpayFetch<PodPayWithdrawal>(
      `/v1/withdrawals/${encodeURIComponent(id)}/cancel`,
      { method: "PATCH", config }
    );
  },

  getAvailableBalance(config?: PodPayConfig): Promise<PodPayBalance> {
    return podpayFetch<PodPayBalance>("/v1/balance/available", { config });
  },

  // ── Checkout ──────────────────────────────────────────

  /** POST /v1/checkout/sessions criar sessão hospedada */
  createCheckoutSession(
    dto: PodPayCheckoutCreateSessionRequest,
    opts?: { idempotencyKey?: string; config?: PodPayConfig }
  ): Promise<PodPayCheckoutSessionCreated> {
    return podpayFetch<PodPayCheckoutSessionCreated>("/v1/checkout/sessions", {
      method: "POST",
      body: JSON.stringify(dto),
      config: opts?.config,
      idempotency: true,
      headers: opts?.idempotencyKey
        ? { "X-Idempotency-Key": opts.idempotencyKey }
        : undefined,
    });
  },

  /** GET /v1/checkout/sessions/{token} sessão pública */
  getCheckoutPublicSession(
    token: string,
    config?: PodPayConfig
  ): Promise<unknown> {
    return podpayFetch(
      `/v1/checkout/sessions/${encodeURIComponent(token)}`,
      { config }
    );
  },

  /** POST /v1/checkout/sessions/{token}/coupon */
  applyCheckoutCoupon(
    token: string,
    dto: PodPayCheckoutApplyCouponRequest,
    config?: PodPayConfig
  ): Promise<PodPayCheckoutApplyCouponResponse> {
    return podpayFetch(
      `/v1/checkout/sessions/${encodeURIComponent(token)}/coupon`,
      {
        method: "POST",
        body: JSON.stringify(dto),
        config,
      }
    );
  },

  /** POST /v1/checkout/sessions/{token}/pay gera PIX no checkout */
  payCheckoutSession(
    token: string,
    dto: PodPayCheckoutPayRequest,
    opts?: { idempotencyKey?: string; config?: PodPayConfig }
  ): Promise<PodPayCheckoutPayResponse> {
    return podpayFetch(
      `/v1/checkout/sessions/${encodeURIComponent(token)}/pay`,
      {
        method: "POST",
        body: JSON.stringify(dto),
        config: opts?.config,
        idempotency: true,
        headers: opts?.idempotencyKey
          ? { "X-Idempotency-Key": opts.idempotencyKey }
          : undefined,
      }
    );
  },

  /** POST /v1/checkout/payment-links/{publicToken}/sessions */
  openPaymentLinkSession(
    publicToken: string,
    body?: { expiresAt?: string },
    config?: PodPayConfig
  ): Promise<PodPayCheckoutSessionCreated> {
    return podpayFetch(
      `/v1/checkout/payment-links/${encodeURIComponent(publicToken)}/sessions`,
      {
        method: "POST",
        body: JSON.stringify(body ?? {}),
        config,
        idempotency: true,
      }
    );
  },
};
