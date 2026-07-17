/**
 * Config Velana via env + credencial no banco (Admin → Adquirentes → Credenciais).
 * Docs: https://velana.readme.io/reference/introducao
 *
 * Taxas:
 * - Custo DarkPay → Velana: R$ 0,80 / TX (feeFixed do acquirer)
 * - Taxa cobrada do seller (padrão): 2,99% + R$ 1,00 (margem sobre o custo)
 */

import type { VelanaConfig, VelanaEnv } from "./types";

const STORAGE_KEY = "darkpay.velana.config.v1";

/** Custo fixo que a Velana cobra da DarkPay por transação (R$) */
export const VELANA_COST_FIXED = 0.8;

/** Taxa padrão repassada ao seller quando não há fee custom (R$ + %) */
export const VELANA_DEFAULT_SELLER_FEE_PERCENT = 2.99;
export const VELANA_DEFAULT_SELLER_FEE_FIXED = 1.0;

export function getVelanaBaseUrl(_env?: VelanaEnv): string {
  return (
    process.env.VELANA_BASE_URL?.trim() || "https://api.velana.com.br/v1"
  );
}

export function getVelanaConfigFromEnv(): VelanaConfig | null {
  const secretKey =
    process.env.VELANA_SECRET_KEY ||
    process.env.VELANA_API_KEY ||
    process.env.VELANA_PRIVATE_KEY ||
    "";
  if (!secretKey.trim()) return null;
  const env: VelanaEnv =
    process.env.VELANA_ENV === "sandbox" ? "sandbox" : "live";
  return {
    secretKey: secretKey.trim(),
    env,
    baseUrl: getVelanaBaseUrl(env),
    publicKey: process.env.VELANA_PUBLIC_KEY || undefined,
    postbackBaseUrl:
      process.env.VELANA_POSTBACK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      undefined,
  };
}

function configFromSecret(
  secretKey: string,
  envHint?: string | null,
  publicKey?: string | null
): VelanaConfig {
  const key = secretKey.trim();
  const env: VelanaEnv =
    envHint === "sandbox" ||
    key.toLowerCase().includes("test") ||
    key.toLowerCase().includes("sandbox")
      ? "sandbox"
      : "live";
  return {
    secretKey: key,
    env,
    baseUrl: getVelanaBaseUrl(env),
    publicKey: publicKey?.trim() || undefined,
    postbackBaseUrl:
      process.env.VELANA_POSTBACK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      undefined,
  };
}

/** Config salva no browser (cache admin) */
export function loadVelanaConfigClient(): VelanaConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VelanaConfig>;
    if (!parsed.secretKey?.trim()) return null;
    return configFromSecret(
      parsed.secretKey,
      parsed.env,
      parsed.publicKey
    );
  } catch {
    return null;
  }
}

export function saveVelanaConfigClient(
  config: Omit<VelanaConfig, "baseUrl"> & { baseUrl?: string }
): void {
  if (typeof window === "undefined") return;
  const full = configFromSecret(
    config.secretKey,
    config.env,
    config.publicKey
  );
  if (config.baseUrl) full.baseUrl = config.baseUrl;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  window.dispatchEvent(
    new CustomEvent("darkpay:velana-config", { detail: full })
  );
}

export function clearVelanaConfigClient(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function resolveVelanaConfig(): VelanaConfig | null {
  if (typeof window === "undefined") {
    return getVelanaConfigFromEnv();
  }
  return loadVelanaConfigClient() || getVelanaConfigFromEnv();
}

/**
 * Server: prioridade
 * 1) Credencial Velana no DB (Admin → Adquirentes → Credenciais)
 * 2) VELANA_SECRET_KEY no .env
 */
export async function resolveVelanaConfigServer(): Promise<VelanaConfig | null> {
  try {
    const { prisma, isDatabaseConfigured } = await import(
      "@/lib/server/prisma"
    );
    if (isDatabaseConfigured()) {
      const preferred = await prisma.acquirer.findFirst({
        where: {
          OR: [{ code: "VELANA" }, { id: "velana" }],
          enabled: true,
        },
        orderBy: [{ isPrimary: "desc" }, { priority: "asc" }],
      });
      const key = preferred?.privateKey?.trim();
      if (key) {
        const cfg = configFromSecret(key, preferred?.env, preferred?.publicKey);
        // postback: URL pública da app (webhook Velana)
        if (!cfg.postbackBaseUrl) {
          cfg.postbackBaseUrl =
            process.env.VELANA_POSTBACK_BASE_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            undefined;
        }
        return cfg;
      }
    }
  } catch {
    /* DB offline */
  }
  return getVelanaConfigFromEnv();
}

export async function isVelanaEnabledServer(): Promise<boolean> {
  const cfg = await resolveVelanaConfigServer();
  return !!cfg?.secretKey;
}

export function isVelanaEnabled(): boolean {
  return !!resolveVelanaConfig()?.secretKey;
}

export function resolveVelanaConfigFromRequest(
  req: Request
): VelanaConfig | null {
  const headerKey =
    req.headers.get("x-velana-secret-key")?.trim() ||
    req.headers.get("x-velana-api-key")?.trim();
  if (headerKey) {
    return configFromSecret(headerKey);
  }
  return getVelanaConfigFromEnv();
}

/** Header Authorization Basic da Velana: base64(secretKey:x) */
export function buildVelanaAuthHeader(secretKey: string): string {
  const token = `${secretKey.trim()}:x`;
  if (typeof Buffer !== "undefined") {
    return `Basic ${Buffer.from(token, "utf8").toString("base64")}`;
  }
  // fallback browser
  return `Basic ${btoa(token)}`;
}

/**
 * Taxa cobrada do seller na venda Velana (R$).
 * Cobre o custo R$ 0,80 e gera margem para a plataforma.
 */
export function computeVelanaSellerFee(
  amountReais: number,
  opts?: { percent?: number; fixed?: number }
): number {
  const percent = opts?.percent ?? VELANA_DEFAULT_SELLER_FEE_PERCENT;
  const fixed = opts?.fixed ?? VELANA_DEFAULT_SELLER_FEE_FIXED;
  const fee = amountReais * (percent / 100) + fixed;
  // Nunca cobrar menos que o custo + margem mínima de R$ 0,20
  const minFee = VELANA_COST_FIXED + 0.2;
  return Math.round(Math.max(fee, minFee) * 100) / 100;
}

export { STORAGE_KEY as VELANA_CONFIG_STORAGE_KEY };
