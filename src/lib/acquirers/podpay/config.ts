/**
 * Config PodPay via env + override em runtime (admin/localStorage).
 */

import type { PodPayConfig, PodPayEnv } from "./types";

const STORAGE_KEY = "darkpay.podpay.config.v1";

export function getPodPayBaseUrl(env: PodPayEnv): string {
  if (env === "sandbox") return "https://sandbox.podpay.app";
  return "https://api.podpay.app";
}

/** Config a partir de variáveis de ambiente (server) */
export function getPodPayConfigFromEnv(): PodPayConfig | null {
  const apiKey =
    process.env.PODPAY_API_KEY ||
    process.env.PODPAY_SECRET_KEY ||
    "";
  if (!apiKey.trim()) return null;
  const env: PodPayEnv =
    process.env.PODPAY_ENV === "sandbox" || apiKey.includes("test")
      ? "sandbox"
      : "live";
  return {
    apiKey: apiKey.trim(),
    env,
    baseUrl: process.env.PODPAY_BASE_URL || getPodPayBaseUrl(env),
    webhookSecret: process.env.PODPAY_WEBHOOK_SECRET || undefined,
    postbackBaseUrl: process.env.PODPAY_POSTBACK_BASE_URL || undefined,
  };
}

/** Config salva no browser (painel admin / integrações) */
export function loadPodPayConfigClient(): PodPayConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PodPayConfig>;
    if (!parsed.apiKey?.trim()) return null;
    const env: PodPayEnv =
      parsed.env === "sandbox" || parsed.apiKey.includes("test")
        ? "sandbox"
        : "live";
    return {
      apiKey: parsed.apiKey.trim(),
      env,
      baseUrl: parsed.baseUrl || getPodPayBaseUrl(env),
      webhookSecret: parsed.webhookSecret,
      postbackBaseUrl: parsed.postbackBaseUrl,
    };
  } catch {
    return null;
  }
}

export function savePodPayConfigClient(
  config: Omit<PodPayConfig, "baseUrl"> & { baseUrl?: string }
): void {
  if (typeof window === "undefined") return;
  const env = config.env || "sandbox";
  const full: PodPayConfig = {
    apiKey: config.apiKey.trim(),
    env,
    baseUrl: config.baseUrl || getPodPayBaseUrl(env),
    webhookSecret: config.webhookSecret,
    postbackBaseUrl: config.postbackBaseUrl,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  window.dispatchEvent(
    new CustomEvent("darkpay:podpay-config", { detail: full })
  );
}

export function clearPodPayConfigClient(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Resolve config: env server primeiro, senão client storage */
export function resolvePodPayConfig(): PodPayConfig | null {
  if (typeof window === "undefined") {
    return getPodPayConfigFromEnv();
  }
  return loadPodPayConfigClient() || getPodPayConfigFromEnv();
}

function configFromPrivateKey(
  key: string,
  _envHint?: string | null
): PodPayConfig {
  const apiKey = key.trim();
  // Prefixo da chave manda: sk_live_ → api.podpay.app | sk_test_ → sandbox
  const env: PodPayEnv =
    apiKey.includes("_test_") || apiKey.startsWith("sk_test")
      ? "sandbox"
      : "live";
  return {
    apiKey,
    env,
    baseUrl:
      process.env.PODPAY_BASE_URL?.trim() || getPodPayBaseUrl(env),
    webhookSecret: process.env.PODPAY_WEBHOOK_SECRET || undefined,
    postbackBaseUrl:
      process.env.PODPAY_POSTBACK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      undefined,
  };
}

/**
 * Server: prioridade
 * 1) Credencial PodPay salva no DB (id/code PODPAY) NUNCA usa chave da Velana
 * 2) PODPAY_API_KEY no .env
 *
 * Nota: isPrimary sozinha NÃO define PodPay Velana também pode ser primária
 * com chave sk_… e não deve ser enviada à API PodPay.
 */
export async function resolvePodPayConfigServer(): Promise<PodPayConfig | null> {
  try {
    const { prisma, isDatabaseConfigured } = await import(
      "@/lib/server/prisma"
    );
    if (isDatabaseConfigured()) {
      // 1) Somente adquirente PodPay explícita
      const preferred = await prisma.acquirer.findFirst({
        where: {
          OR: [{ code: "PODPAY" }, { id: "podpay" }],
        },
        orderBy: [{ isPrimary: "desc" }, { priority: "asc" }],
      });
      const preferredKey = preferred?.privateKey?.trim();
      if (preferredKey?.startsWith("sk_")) {
        return configFromPrivateKey(preferredKey, preferred?.env);
      }
    }
  } catch {
    /* DB offline */
  }
  return getPodPayConfigFromEnv();
}

export function isPodPayEnabled(): boolean {
  return !!resolvePodPayConfig()?.apiKey;
}

export async function isPodPayEnabledServer(): Promise<boolean> {
  const cfg = await resolvePodPayConfigServer();
  return !!cfg?.apiKey;
}

/**
 * Resolve config no BFF a partir do request.
 * Preferência: header `x-podpay-api-key` (chave salva no painel) → env server.
 * Assim o hub /integracoes/podpay funciona sem PODPAY_API_KEY no .env.
 */
export function resolvePodPayConfigFromRequest(
  req: Request
): PodPayConfig | null {
  const headerKey =
    req.headers.get("x-podpay-api-key")?.trim() ||
    req.headers.get("x-api-key")?.trim();
  if (headerKey?.startsWith("sk_")) {
    const env: PodPayEnv = headerKey.includes("test") ? "sandbox" : "live";
    return {
      apiKey: headerKey,
      env,
      baseUrl: getPodPayBaseUrl(env),
    };
  }
  return getPodPayConfigFromEnv();
}

export function isPodPayEnabledFromRequest(req: Request): boolean {
  return !!resolvePodPayConfigFromRequest(req)?.apiKey;
}

export { STORAGE_KEY as PODPAY_CONFIG_STORAGE_KEY };
