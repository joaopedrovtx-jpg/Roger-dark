/**
 * Cliente HTTP Velana API v1
 *
 * Docs: https://velana.readme.io/reference/introducao
 * Auth (oficial): Authorization: Basic base64("{SECRET_KEY}:x")
 * Base: https://api.velana.com.br/v1
 * Valores em CENTAVOS
 *
 * Chaves: Admin → Adquirentes → Credenciais → Velana
 *   - publicKey  (pk_…)  → opcional no servidor; tokenização cartão
 *   - privateKey (sk_…)  → SECRET_KEY usada no Basic Auth
 */

import type {
  VelanaBalance,
  VelanaConfig,
  VelanaCreateTransaction,
  VelanaCreateTransfer,
  VelanaTransaction,
  VelanaTransfer,
} from "./types";
import { buildVelanaAuthHeader, resolveVelanaConfig } from "./config";

export class VelanaError extends Error {
  code?: string;
  status?: number;
  details?: unknown;

  constructor(
    message: string,
    opts?: { code?: string; status?: number; details?: unknown }
  ) {
    super(message);
    this.name = "VelanaError";
    this.code = opts?.code;
    this.status = opts?.status;
    this.details = opts?.details;
  }
}

function classifyVelanaMessage(message: string, status: number): string {
  const m = message.toLowerCase();
  if (
    m.includes("expirada") ||
    m.includes("expirado") ||
    m.includes("realize o reset")
  ) {
    return "VELANA_KEY_EXPIRED";
  }
  if (m.includes("token inválido") || m.includes("token invalido") || status === 401) {
    return "VELANA_UNAUTHORIZED";
  }
  if (status === 400) return "VELANA_BAD_REQUEST";
  return "VELANA_HTTP_ERROR";
}

function humanizeVelanaError(message: string, code: string): string {
  if (code === "VELANA_KEY_EXPIRED") {
    return (
      "Velana: chave de API expirada. Abra https://app.velana.com.br/settings/credentials, " +
      "faça o RESET das chaves, copie a nova chave pública (pk_) e a secret (sk_) e salve em " +
      "Admin → Adquirentes → Credenciais → Velana."
    );
  }
  if (code === "VELANA_UNAUTHORIZED") {
    return (
      "Velana: autenticação rejeitada. Confira a secret key (sk_) salva no Admin. " +
      "Auth oficial: Basic base64(secretKey:x)."
    );
  }
  return message.startsWith("Velana:") ? message : `Velana: ${message}`;
}

function velanaTimeoutMs(): number {
  const v = Number(process.env.ACQUIRER_FETCH_TIMEOUT_MS);
  if (Number.isFinite(v) && v >= 1000) return v;
  return 15_000;
}

async function velanaFetch<T>(
  path: string,
  init?: RequestInit & { config?: VelanaConfig | null }
): Promise<T> {
  const config = init?.config ?? resolveVelanaConfig();
  if (!config?.secretKey) {
    throw new VelanaError(
      "Velana não configurada. Em Admin → Adquirentes → Credenciais, salve a secret key (sk_) da Velana.",
      { code: "VELANA_NOT_CONFIGURED" }
    );
  }

  // Docs oficiais: authorization Basic {SECRET_KEY}:x
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: buildVelanaAuthHeader(config.secretKey),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const base = config.baseUrl.replace(/\/$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), velanaTimeoutMs());
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (e) {
    clearTimeout(timeout);
    if (controller.signal.aborted) {
      throw new VelanaError(
        `Velana timeout após ${velanaTimeoutMs()}ms`,
        { code: "VELANA_TIMEOUT", status: 504 }
      );
    }
    throw e;
  }

  let body: unknown = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const errObj = body as {
      message?: string;
      error?: string | { message?: string; code?: string };
      errors?: unknown;
      msg?: string;
      status?: number;
    } | null;

    const rawMessage =
      (typeof errObj?.error === "object" && errObj.error?.message) ||
      (typeof errObj?.error === "string" ? errObj.error : null) ||
      errObj?.message ||
      errObj?.msg ||
      (Array.isArray(errObj?.errors) ? JSON.stringify(errObj.errors) : null) ||
      (typeof body === "string" && body) ||
      `HTTP ${res.status}`;

    const code = classifyVelanaMessage(String(rawMessage), res.status);
    throw new VelanaError(humanizeVelanaError(String(rawMessage), code), {
      code,
      status: res.status,
      details: body,
    });
  }

  // Envelope opcional { data: ... }
  if (
    body &&
    typeof body === "object" &&
    "data" in (body as object) &&
    (body as { data: unknown }).data != null &&
    !("id" in (body as object)) &&
    !("amount" in (body as object))
  ) {
    return (body as { data: T }).data;
  }

  return body as T;
}

export const velanaClient = {
  isConfigured(): boolean {
    return !!resolveVelanaConfig()?.secretKey;
  },

  getConfig(): VelanaConfig | null {
    return resolveVelanaConfig();
  },

  /** GET /balance/available valida secret key */
  getAvailableBalance(config?: VelanaConfig): Promise<VelanaBalance> {
    return velanaFetch<VelanaBalance>("/balance/available", { config });
  },

  /**
   * POST /transactions
   * PIX: paymentMethod "pix" + amount (centavos) + customer + items
   * Docs: https://velana.readme.io/reference/criar-transacao
   */
  createTransaction(
    dto: VelanaCreateTransaction,
    opts?: { config?: VelanaConfig }
  ): Promise<VelanaTransaction> {
    return velanaFetch<VelanaTransaction>("/transactions", {
      method: "POST",
      body: JSON.stringify(dto),
      config: opts?.config,
    });
  },

  listTransactions(params?: {
    page?: number;
    status?: string;
    paymentMethods?: string;
    config?: VelanaConfig;
  }): Promise<unknown> {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.status) q.set("status", params.status);
    if (params?.paymentMethods) q.set("paymentMethods", params.paymentMethods);
    const qs = q.toString();
    return velanaFetch(`/transactions${qs ? `?${qs}` : ""}`, {
      config: params?.config,
    });
  },

  getTransaction(
    id: string | number,
    config?: VelanaConfig
  ): Promise<VelanaTransaction> {
    return velanaFetch<VelanaTransaction>(
      `/transactions/${encodeURIComponent(String(id))}`,
      { config }
    );
  },

  refundTransaction(
    id: string | number,
    amountCents?: number,
    config?: VelanaConfig
  ): Promise<VelanaTransaction> {
    return velanaFetch<VelanaTransaction>(
      `/transactions/${encodeURIComponent(String(id))}/refund`,
      {
        method: "POST",
        body: JSON.stringify(
          amountCents != null ? { amount: amountCents } : {}
        ),
        config,
      }
    );
  },

  createTransfer(
    dto: VelanaCreateTransfer,
    opts?: { config?: VelanaConfig }
  ): Promise<VelanaTransfer> {
    return velanaFetch<VelanaTransfer>("/transfers", {
      method: "POST",
      body: JSON.stringify(dto),
      config: opts?.config,
    });
  },

  getTransfer(
    id: string | number,
    config?: VelanaConfig
  ): Promise<VelanaTransfer> {
    return velanaFetch<VelanaTransfer>(
      `/transfers/${encodeURIComponent(String(id))}`,
      { config }
    );
  },

  /** GET /company */
  getCompany(config?: VelanaConfig): Promise<unknown> {
    return velanaFetch("/company", { config });
  },

  /**
   * POST /checkouts
   * Docs: https://velana.readme.io/reference/criar-checkout
   */
  createCheckout(
    dto: {
      amount: number;
      items: Array<{
        title: string;
        unitPrice: number;
        quantity: number;
        tangible: boolean;
        externalRef?: string;
      }>;
      settings: {
        defaultPaymentMethod: "pix" | "credit_card" | "boleto" | string;
        requestAddress: boolean;
        requestPhone: boolean;
        requestDocument?: boolean;
        traceable: boolean;
        pix?: { enabled: boolean; expiresInDays: number };
        boleto?: { enabled: boolean; expiresInDays: number };
        card?: {
          enabled: boolean;
          freeInstallments: number;
          maxInstallments: number;
        };
      };
      splits: Array<{
        recipientId: number;
        amount: number;
        chargeProcessingFee?: boolean;
      }>;
      postbackUrl?: string;
      description?: string;
    },
    opts?: { config?: VelanaConfig }
  ): Promise<unknown> {
    return velanaFetch("/checkouts", {
      method: "POST",
      body: JSON.stringify(dto),
      config: opts?.config,
    });
  },

  /** GET /checkouts/{id} */
  getCheckout(id: string | number, config?: VelanaConfig): Promise<unknown> {
    return velanaFetch(`/checkouts/${encodeURIComponent(String(id))}`, {
      config,
    });
  },
};
