/**
 * Cliente HTTP Woovi
 *
 * Auth (oficial):
 *   Authorization: SEU_APPID_AQUI
 * (um único AppID — sem Basic, sem pk_/sk_)
 *
 * Base prod: https://api.woovi.com
 * Ex.: GET https://api.woovi.com/api/v1/charge
 */

import type {
  WooviAccount,
  WooviConfig,
  WooviCreateCharge,
  WooviCreateChargeResponse,
  WooviCreatePayment,
  WooviCharge,
  WooviPayment,
} from "./types";
import {
  buildWooviAuthHeader,
  resolveWooviConfig,
} from "./config";

export class WooviError extends Error {
  code?: string;
  status?: number;
  details?: unknown;

  constructor(
    message: string,
    opts?: { code?: string; status?: number; details?: unknown }
  ) {
    super(message);
    this.name = "WooviError";
    this.code = opts?.code;
    this.status = opts?.status;
    this.details = opts?.details;
  }
}

function wooviTimeoutMs(): number {
  const v = Number(process.env.ACQUIRER_FETCH_TIMEOUT_MS);
  if (Number.isFinite(v) && v >= 1000) return v;
  return 15_000;
}

function classifyMessage(message: string, status: number): string {
  const m = message.toLowerCase();
  // PIX out / Payment Request desabilitado na empresa (NÃO é AppID inválido)
  if (
    m.includes("pagamentos externos") ||
    m.includes("pagamento externo") ||
    m.includes("não estão habilitados") ||
    m.includes("nao estao habilitados") ||
    m.includes("not enabled") ||
    m.includes("payment not allowed") ||
    (m.includes("payment") && m.includes("not") && m.includes("enabl"))
  ) {
    return "WOOVI_PAYOUT_DISABLED";
  }
  if (
    status === 401 ||
    m.includes("unauthorized") ||
    m.includes("appid inválido") ||
    m.includes("appid invalido") ||
    m.includes("app id inválido")
  ) {
    return "WOOVI_UNAUTHORIZED";
  }
  // 403 genérico sem o texto de payout — não rotular como AppID
  if (status === 403) return "WOOVI_FORBIDDEN";
  if (status === 404) return "WOOVI_NOT_FOUND";
  if (status === 400) return "WOOVI_BAD_REQUEST";
  return "WOOVI_HTTP_ERROR";
}

function humanize(message: string, code: string): string {
  // Mensagens internas para log; a API pública /payments sanitiza pro checkout
  if (code === "WOOVI_PAYOUT_DISABLED") {
    return (
      "Saque automático indisponível nesta conta do app de pagamento " +
      "(pagamentos externos/PIX out não habilitados). O saque pode ser processado manualmente."
    );
  }
  if (code === "WOOVI_UNAUTHORIZED") {
    return "App de pagamento: autenticação rejeitada (AppID inválido).";
  }
  if (code === "WOOVI_FORBIDDEN") {
    return "App de pagamento recusou a operação (sem permissão).";
  }
  if (code === "WOOVI_NOT_CONFIGURED") {
    return "App de pagamento não configurado.";
  }
  // Remove prefixo de marca se a API devolver
  const clean = String(message || "")
    .replace(/^woovi:\s*/i, "")
    .replace(/^openpix:\s*/i, "")
    .trim();
  return clean || "Falha no app de pagamento";
}

/** true quando a Woovi rejeitou por falta de feature de payment/PIX out */
export function isWooviPayoutDisabledError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: string }).code || "");
    if (code === "WOOVI_PAYOUT_DISABLED") return true;
  }
  const msg = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
  return (
    msg.includes("pagamentos externos") ||
    msg.includes("pix out") ||
    msg.includes("saque automático indisponível") ||
    msg.includes("saque automatico indisponivel")
  );
}

async function wooviFetch<T>(
  path: string,
  init?: RequestInit & { config?: WooviConfig | null }
): Promise<T> {
  const config = init?.config ?? resolveWooviConfig();
  if (!config?.appId) {
    throw new WooviError(
      "Woovi não configurada. Salve o AppID em Admin → Adquirentes → Credenciais → Woovi.",
      { code: "WOOVI_NOT_CONFIGURED" }
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: buildWooviAuthHeader(config.appId),
    ...(init?.headers as Record<string, string> | undefined),
  };

  const base = config.baseUrl.replace(/\/$/, "");
  // Aceita paths /api/v1/... ou /api/openpix/v1/...
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), wooviTimeoutMs());
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
      throw new WooviError(`Woovi timeout após ${wooviTimeoutMs()}ms`, {
        code: "WOOVI_TIMEOUT",
        status: 504,
      });
    }
    throw e;
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const errObj = body as {
      error?: string | { message?: string };
      message?: string;
      errors?: unknown;
    } | null;
    const rawMessage =
      (typeof errObj?.error === "object" && errObj.error?.message) ||
      (typeof errObj?.error === "string" ? errObj.error : null) ||
      errObj?.message ||
      (typeof body === "string" && body) ||
      `HTTP ${res.status}`;
    const code = classifyMessage(String(rawMessage), res.status);
    throw new WooviError(humanize(String(rawMessage), code), {
      code,
      status: res.status,
      details: body,
    });
  }

  return body as T;
}

export const wooviClient = {
  isConfigured(): boolean {
    return !!resolveWooviConfig()?.appId;
  },

  getConfig(): WooviConfig | null {
    return resolveWooviConfig();
  },

  /** POST /api/v1/charge — criar cobrança PIX */
  createCharge(
    dto: WooviCreateCharge,
    opts?: { config?: WooviConfig }
  ): Promise<WooviCreateChargeResponse> {
    return wooviFetch<WooviCreateChargeResponse>("/api/v1/charge", {
      method: "POST",
      body: JSON.stringify(dto),
      config: opts?.config,
    });
  },

  /** GET /api/v1/charge/:id — correlationID ou id */
  getCharge(
    id: string,
    config?: WooviConfig
  ): Promise<{ charge?: WooviCharge }> {
    return wooviFetch(`/api/v1/charge/${encodeURIComponent(id)}`, {
      config,
    });
  },

  /** GET /api/v1/account/ — lista contas + saldo */
  listAccounts(
    config?: WooviConfig
  ): Promise<{ accounts?: WooviAccount[] }> {
    return wooviFetch("/api/v1/account/", { config });
  },

  /** GET /api/v1/company */
  getCompany(config?: WooviConfig): Promise<unknown> {
    return wooviFetch("/api/v1/company", { config });
  },

  /**
   * POST /api/v1/payment — cria solicitação de pagamento (PIX out).
   * Status inicial: CREATED (aparece em Saques/Pagamentos na Woovi).
   * Docs: payment-how-to-use-api-to-create
   * Requer PIX OUT habilitado na empresa.
   */
  createPayment(
    dto: WooviCreatePayment,
    opts?: { config?: WooviConfig }
  ): Promise<{ payment?: WooviPayment } | WooviPayment> {
    return wooviFetch("/api/v1/payment", {
      method: "POST",
      body: JSON.stringify(dto),
      config: opts?.config,
    });
  },

  /**
   * POST /api/v1/payment/approve — aprova e envia o PIX.
   * Body: { correlationID }
   * Docs: payment-how-to-use-api-to-approve / validate-bank-data
   */
  approvePayment(
    correlationID: string,
    opts?: { config?: WooviConfig }
  ): Promise<{ payment?: WooviPayment; transaction?: unknown; destination?: unknown }> {
    return wooviFetch("/api/v1/payment/approve", {
      method: "POST",
      body: JSON.stringify({ correlationID }),
      config: opts?.config,
    });
  },

  getPayment(
    id: string,
    config?: WooviConfig
  ): Promise<{ payment?: WooviPayment }> {
    return wooviFetch(`/api/v1/payment/${encodeURIComponent(id)}`, {
      config,
    });
  },
};
