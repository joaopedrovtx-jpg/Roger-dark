/**
 * Feature flags runtime.
 *
 * Hoje os toggles vivem só em env vars (CSRF_STRICT, REQUIRE_ADMIN_2FA,
 * ALLOW_MOCK_DATA, ALLOW_SEED_LOGIN, ALLOW_UNSIGNED_WEBHOOKS).
 * Este service provê uma leitura unificada + (opcional) overrides por DB
 * na tabela `RateLimit` reaproveitada como KV — sem exigir migração nova.
 *
 * Em uma futura evolução pode trocar o backend por um modelo `FeatureFlag`.
 */

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

export type FlagKey =
  | "CSRF_STRICT"
  | "REQUIRE_ADMIN_2FA"
  | "ALLOW_MOCK_DATA"
  | "ALLOW_SEED_LOGIN"
  | "ALLOW_UNSIGNED_WEBHOOKS";

const DEFAULTS: Record<FlagKey, boolean> = {
  CSRF_STRICT: true,
  REQUIRE_ADMIN_2FA: false,
  ALLOW_MOCK_DATA: false,
  ALLOW_SEED_LOGIN: false,
  ALLOW_UNSIGNED_WEBHOOKS: false,
};

function envBool(key: FlagKey): boolean | null {
  const raw = process.env[key];
  if (raw === undefined) return null;
  if (raw === "") return null;
  return raw === "1" || raw.toLowerCase() === "true" || raw === "on";
}

/** Lê a flag sem DB (rápido p/ middleware edge). */
export function getFlag(key: FlagKey): boolean {
  const env = envBool(key);
  if (env !== null) return env;
  return DEFAULTS[key];
}

export interface FlagOverride {
  key: FlagKey;
  value: boolean;
  reason?: string;
}

/**
 * Lê overrides persistidos em RateLimit (key=`flag:<NAME>`) por processo
 * administrativo. Falha silenciosamente se banco indisponível.
 */
export async function getFlagOverrides(): Promise<
  Partial<Record<FlagKey, boolean>>
> {
  if (!isDatabaseConfigured()) return {};
  try {
    const rows = await prisma.rateLimit.findMany({
      where: { key: { startsWith: "flag:" } },
    });
    const out: Partial<Record<FlagKey, boolean>> = {};
    for (const r of rows) {
      const name = r.key.replace(/^flag:/, "") as FlagKey;
      if (name in DEFAULTS) {
        out[name] = r.attempts > 0;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Resolve flag combinando env + override. */
export async function resolveFlag(key: FlagKey): Promise<boolean> {
  const overrides = await getFlagOverrides();
  if (key in overrides && overrides[key] !== undefined) {
    return overrides[key] as boolean;
  }
  return getFlag(key);
}

export async function setFlagOverride(
  key: FlagKey,
  value: boolean,
  reason?: string
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await prisma.rateLimit.upsert({
      where: { key: `flag:${key}` },
      update: { attempts: value ? 1 : 0, expiresAt },
      create: {
        id: `flag_${key}_${Date.now().toString(36)}`,
        key: `flag:${key}`,
        attempts: value ? 1 : 0,
        expiresAt,
      },
    });
    void reason; // futuro: coluna reason no model FeatureFlag
    return true;
  } catch {
    return false;
  }
}

export async function clearFlagOverride(key: FlagKey): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await prisma.rateLimit.deleteMany({ where: { key: `flag:${key}` } });
    return true;
  } catch {
    return false;
  }
}

export function listAllFlags(): Array<{
  key: FlagKey;
  env: boolean;
  default: boolean;
}> {
  return (Object.keys(DEFAULTS) as FlagKey[]).map((k) => ({
    key: k,
    env: (() => {
      const e = envBool(k);
      return e === null ? DEFAULTS[k] : e;
    })(),
    default: DEFAULTS[k],
  }));
}