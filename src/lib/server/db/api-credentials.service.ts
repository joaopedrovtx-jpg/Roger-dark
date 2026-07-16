/**
 * Credenciais de API do seller (Integrações → API).
 * Formato gateway:
 *   publicKey  pk_live_… | pk_test_…
 *   secretKey  sk_live_… | sk_test_…  (retornada só na criação/rotação)
 *
 * O seller usa essas chaves no cassino/checkout próprio.
 * DarkPay intermedia com a adquirente (PodPay) no servidor — o seller nunca vê sk_ da PodPay.
 */

import { createHash, randomBytes } from "crypto";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

export type ApiPermission =
  | "transacoes"
  | "saques"
  | "checkouts"
  | "conta";

export type ApiKeyEnv = "live" | "test";

export type ApiCredentialMeta = {
  scopes: ApiPermission[];
  requireManualSaqueApproval: boolean;
  expiresAt: string | null;
  env: ApiKeyEnv;
};

export type ApiCredentialPublic = {
  id: string;
  name: string;
  publicKey: string;
  /** null após listagem — só preenchida em create/rotate */
  secretKey: string | null;
  secretKeyHint: string | null;
  permissions: ApiPermission[];
  requireManualSaqueApproval: boolean;
  expiresAt: string | null;
  env: ApiKeyEnv;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiCredentialAuth = {
  credentialId: string;
  userId: string;
  permissions: ApiPermission[];
  requireManualSaqueApproval: boolean;
  env: ApiKeyEnv;
  publicKey: string;
};

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

function randomKeyPart(bytes = 24): string {
  return randomBytes(bytes).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, bytes * 2);
}

/** Hash determinístico para lookup O(1) da secret (chaves de alta entropia) */
export function hashApiSecret(secret: string): string {
  return createHash("sha256").update(secret.trim()).digest("hex");
}

export function secretHint(secret: string): string {
  const s = secret.trim();
  if (s.length <= 8) return "••••";
  return `…${s.slice(-4)}`;
}

function parsePermissions(raw: unknown): ApiCredentialMeta {
  const defaults: ApiCredentialMeta = {
    scopes: ["transacoes"],
    requireManualSaqueApproval: false,
    expiresAt: null,
    env: "live",
  };
  if (Array.isArray(raw)) {
    return {
      ...defaults,
      scopes: raw.filter((x): x is ApiPermission =>
        ["transacoes", "saques", "checkouts", "conta"].includes(String(x))
      ),
    };
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const scopes = Array.isArray(o.scopes)
      ? o.scopes.filter((x): x is ApiPermission =>
          ["transacoes", "saques", "checkouts", "conta"].includes(String(x))
        )
      : defaults.scopes;
    return {
      scopes: scopes.length ? scopes : defaults.scopes,
      requireManualSaqueApproval: !!o.requireManualSaqueApproval,
      expiresAt:
        typeof o.expiresAt === "string" && o.expiresAt ? o.expiresAt : null,
      env: o.env === "test" ? "test" : "live",
    };
  }
  return defaults;
}

function toPublic(
  row: {
    id: string;
    name: string;
    publicKey: string;
    secretKeyHint: string | null;
    permissions: unknown;
    active: boolean;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  secretKey: string | null = null
): ApiCredentialPublic {
  const meta = parsePermissions(row.permissions);
  return {
    id: row.id,
    name: row.name,
    publicKey: row.publicKey,
    secretKey,
    secretKeyHint: row.secretKeyHint,
    permissions: meta.scopes,
    requireManualSaqueApproval: meta.requireManualSaqueApproval,
    expiresAt: meta.expiresAt,
    env: meta.env,
    active: row.active,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function generateKeyPair(env: ApiKeyEnv) {
  const prefix = env === "test" ? "test" : "live";
  const publicKey = `pk_${prefix}_${randomKeyPart(18)}`;
  const secretKey = `sk_${prefix}_${randomKeyPart(28)}`;
  return { publicKey, secretKey };
}

async function assertDb() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL não configurada");
  }
  await prisma.$queryRaw`SELECT 1`;
}

export async function listApiCredentials(
  userId: string
): Promise<ApiCredentialPublic[]> {
  await assertDb();
  const rows = await prisma.apiCredential.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => toPublic(r, null));
}

export async function createApiCredential(
  userId: string,
  input: {
    name?: string;
    permissions?: ApiPermission[];
    requireManualSaqueApproval?: boolean;
    expiresAt?: string | null;
    env?: ApiKeyEnv;
  }
): Promise<ApiCredentialPublic> {
  await assertDb();
  const env: ApiKeyEnv = input.env === "test" ? "test" : "live";
  const { publicKey, secretKey } = generateKeyPair(env);
  const meta: ApiCredentialMeta = {
    scopes:
      input.permissions?.length
        ? input.permissions
        : ["transacoes"],
    requireManualSaqueApproval: !!input.requireManualSaqueApproval,
    expiresAt: input.expiresAt || null,
    env,
  };

  const row = await prisma.apiCredential.create({
    data: {
      id: newId("cred"),
      userId,
      name: (input.name || "API Integração").trim() || "API Integração",
      publicKey,
      secretKeyHash: hashApiSecret(secretKey),
      secretKeyHint: secretHint(secretKey),
      permissions: meta,
      active: true,
    },
  });

  return toPublic(row, secretKey);
}

export async function updateApiCredential(
  userId: string,
  id: string,
  input: {
    name?: string;
    permissions?: ApiPermission[];
    requireManualSaqueApproval?: boolean;
    expiresAt?: string | null;
    active?: boolean;
  }
): Promise<ApiCredentialPublic> {
  await assertDb();
  const existing = await prisma.apiCredential.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new Error("Credencial não encontrada");

  const prev = parsePermissions(existing.permissions);
  const meta: ApiCredentialMeta = {
    scopes: input.permissions ?? prev.scopes,
    requireManualSaqueApproval:
      input.requireManualSaqueApproval ?? prev.requireManualSaqueApproval,
    expiresAt:
      input.expiresAt !== undefined ? input.expiresAt : prev.expiresAt,
    env: prev.env,
  };

  const row = await prisma.apiCredential.update({
    where: { id: existing.id },
    data: {
      name: input.name?.trim() || existing.name,
      permissions: meta,
      active: input.active ?? existing.active,
    },
  });
  return toPublic(row, null);
}

export async function rotateApiCredential(
  userId: string,
  id: string
): Promise<ApiCredentialPublic> {
  await assertDb();
  const existing = await prisma.apiCredential.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new Error("Credencial não encontrada");

  const meta = parsePermissions(existing.permissions);
  const { publicKey, secretKey } = generateKeyPair(meta.env);

  const row = await prisma.apiCredential.update({
    where: { id: existing.id },
    data: {
      publicKey,
      secretKeyHash: hashApiSecret(secretKey),
      secretKeyHint: secretHint(secretKey),
    },
  });
  return toPublic(row, secretKey);
}

export async function deleteApiCredential(
  userId: string,
  id: string
): Promise<void> {
  await assertDb();
  const existing = await prisma.apiCredential.findFirst({
    where: { id, userId },
  });
  if (!existing) throw new Error("Credencial não encontrada");
  await prisma.apiCredential.delete({ where: { id: existing.id } });
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

/**
 * Autentica request externo via:
 * - Authorization: Bearer sk_live_… | sk_test_…
 * - X-Api-Key: sk_…
 * - X-Public-Key + X-Secret-Key
 * - Basic base64(pk:sk)
 */
export async function authenticateApiKey(
  req: Request
): Promise<ApiCredentialAuth | null> {
  if (!isDatabaseConfigured()) return null;

  let secret: string | null = null;
  let publicKeyHeader: string | null = null;

  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t.startsWith("sk_")) secret = t;
  } else if (auth.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(auth.slice(6).trim(), "base64").toString(
        "utf8"
      );
      const idx = decoded.indexOf(":");
      if (idx >= 0) {
        publicKeyHeader = decoded.slice(0, idx).trim();
        secret = decoded.slice(idx + 1).trim();
      }
    } catch {
      /* ignore */
    }
  }

  if (!secret) {
    const xApi =
      req.headers.get("x-api-key") ||
      req.headers.get("x-secret-key") ||
      req.headers.get("x-darkpay-secret");
    if (xApi?.trim().startsWith("sk_")) secret = xApi.trim();
  }

  if (!publicKeyHeader) {
    publicKeyHeader =
      req.headers.get("x-public-key") ||
      req.headers.get("x-darkpay-public") ||
      null;
  }

  if (!secret?.startsWith("sk_")) return null;

  try {
    const hash = hashApiSecret(secret);
    const row = await prisma.apiCredential.findFirst({
      where: { secretKeyHash: hash, active: true },
      include: { user: true },
    });
    if (!row) return null;
    if (row.user.status === "bloqueado") return null;

    if (publicKeyHeader && publicKeyHeader !== row.publicKey) {
      return null;
    }

    const meta = parsePermissions(row.permissions);
    if (isExpired(meta.expiresAt)) return null;

    // lastUsedAt em background (não bloqueia)
    void prisma.apiCredential
      .update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => null);

    return {
      credentialId: row.id,
      userId: row.userId,
      permissions: meta.scopes,
      requireManualSaqueApproval: meta.requireManualSaqueApproval,
      env: meta.env,
      publicKey: row.publicKey,
    };
  } catch {
    return null;
  }
}

export function hasPermission(
  auth: ApiCredentialAuth,
  perm: ApiPermission
): boolean {
  return auth.permissions.includes(perm);
}
