/**
 * Cliente HTTP da API UTMify (server-side).
 * Docs: https://docs.utmify.com.br/envio-de-vendas
 * Endpoint: POST https://api.utmify.com.br/api-credentials/orders
 * Header: x-api-token
 */

import type { UtmifyOrderPayload, UtmifySendResult } from "./types";

export const UTMIFY_ORDERS_URL =
  "https://api.utmify.com.br/api-credentials/orders";

export const UTMIFY_PLATFORM_NAME = "DarkPay";

/**
 * Formata Date → "YYYY-MM-DD HH:MM:SS" em UTC (exigência UTMify).
 */
export function formatUtmifyUtc(date: Date | string | null | undefined): string | null {
  if (date == null) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

export function reaisToCents(amount: number): number {
  return Math.max(0, Math.round(Number(amount) * 100));
}

/**
 * Envia (ou atualiza) um pedido na UTMify.
 * Usa o mesmo orderId para PIX gerado → pago.
 */
export async function sendUtmifyOrder(
  apiToken: string,
  payload: UtmifyOrderPayload
): Promise<UtmifySendResult> {
  const token = (apiToken || "").trim();
  if (!token) {
    return { ok: false, status: 0, error: "Token UTMify ausente" };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(UTMIFY_ORDERS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-token": token,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (res.ok) {
      return { ok: true, status: res.status };
    }

    let error = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as {
        message?: string;
        error?: string;
        code?: string;
      };
      error =
        body.message ||
        body.error ||
        body.code ||
        (await res.text().catch(() => error)) ||
        error;
    } catch {
      try {
        error = (await res.text()) || error;
      } catch {
        /* ignore */
      }
    }
    return { ok: false, status: res.status, error: String(error).slice(0, 400) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha de rede UTMify";
    return { ok: false, status: 0, error: msg };
  }
}
