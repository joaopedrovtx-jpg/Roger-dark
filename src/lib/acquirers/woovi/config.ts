/**
 * Config Woovi via env + Admin → Adquirentes → Credenciais.
 *
 * Auth (oficial): um único AppID no header
 *   Authorization: SEU_APPID_AQUI
 * (não usa par chave pública + secreta)
 *
 * Docs: https://app.woovi.com/home/applications/tab/doc
 * Base prod: https://api.woovi.com
 * Sandbox: https://api.woovi-sandbox.com
 *
 * No banco: privateKey do Acquirer = AppID
 */

import type { WooviConfig, WooviEnv } from "./types";

export const WOOVI_COST_FIXED = 0;
export const WOOVI_DEFAULT_SELLER_FEE_PERCENT = 0;
export const WOOVI_DEFAULT_SELLER_FEE_FIXED = 0;

export function getWooviBaseUrl(env?: WooviEnv): string {
  if (process.env.WOOVI_BASE_URL?.trim()) {
    return process.env.WOOVI_BASE_URL.trim().replace(/\/$/, "");
  }
  if (env === "sandbox") {
    return "https://api.woovi-sandbox.com";
  }
  // Produção (doc app.woovi.com): https://api.woovi.com
  // Compat: api.openpix.com.br também aponta para a mesma API
  return "https://api.woovi.com";
}

export function getWooviConfigFromEnv(): WooviConfig | null {
  const appId =
    process.env.WOOVI_APP_ID?.trim() ||
    process.env.WOOVI_API_KEY?.trim() ||
    process.env.OPENPIX_APP_ID?.trim() ||
    "";
  if (!appId) return null;
  const env: WooviEnv =
    process.env.WOOVI_ENV === "sandbox" ||
    process.env.OPENPIX_ENV === "sandbox"
      ? "sandbox"
      : "live";
  return {
    appId,
    env,
    baseUrl: getWooviBaseUrl(env),
    postbackBaseUrl:
      process.env.WOOVI_POSTBACK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      undefined,
  };
}

function configFromAppId(
  appId: string,
  envHint?: string | null
): WooviConfig {
  const key = appId.trim();
  const env: WooviEnv =
    envHint === "sandbox" ||
    key.toLowerCase().includes("sandbox") ||
    key.toLowerCase().includes("test")
      ? "sandbox"
      : "live";
  return {
    appId: key,
    env,
    baseUrl: getWooviBaseUrl(env),
    postbackBaseUrl:
      process.env.WOOVI_POSTBACK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      undefined,
  };
}

export function resolveWooviConfig(): WooviConfig | null {
  return getWooviConfigFromEnv();
}

/**
 * Server: prioridade
 * 1) Credencial Woovi no DB (Admin → Adquirentes)
 * 2) WOOVI_APP_ID no .env
 */
export async function resolveWooviConfigServer(): Promise<WooviConfig | null> {
  try {
    const { prisma, isDatabaseConfigured } = await import(
      "@/lib/server/prisma"
    );
    if (isDatabaseConfigured()) {
      const preferred = await prisma.acquirer.findFirst({
        where: {
          OR: [
            { code: "WOOVI" },
            { id: "woovi" },
            { code: "OPENPIX" },
            { id: "openpix" },
          ],
          enabled: true,
        },
        orderBy: [{ isPrimary: "desc" }, { priority: "asc" }],
      });
      const key =
        preferred?.privateKey?.trim() || preferred?.publicKey?.trim() || "";
      if (key) {
        const cfg = configFromAppId(key, preferred?.env);
        if (!cfg.postbackBaseUrl) {
          cfg.postbackBaseUrl =
            process.env.WOOVI_POSTBACK_BASE_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            undefined;
        }
        return cfg;
      }
    }
  } catch {
    /* DB offline */
  }
  return getWooviConfigFromEnv();
}

export async function isWooviEnabledServer(): Promise<boolean> {
  const cfg = await resolveWooviConfigServer();
  return !!cfg?.appId;
}

export function isWooviEnabled(): boolean {
  return !!resolveWooviConfig()?.appId;
}

/** Header Authorization da Woovi: AppID cru (docs oficiais) */
export function buildWooviAuthHeader(appId: string): string {
  return appId.trim();
}
