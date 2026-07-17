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

/**
 * Parte aleatória em hex (comprimento fixo).
 * Antes usávamos base64url + strip de `-_`, o que encurtava a chave de forma
 * imprevisível e gerava secrets “pequenas” / confusas na UI.
 */
function randomKeyPart(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}

/** Hash determinístico para lookup O(1) da secret (chaves de alta entropia) */
export function hashApiSecret(secret: string): string {
  return createHash("sha256").update(secret.trim()).digest("hex");
}

/** Hint visual — NUNCA deve ser montado de volta como sk_ completa na UI */
export function secretHint(secret: string): string {
  const s = secret.trim();
  if (s.length <= 12) return "••••••••";
  return `••••…${s.slice(-4)}`;
}

/**
 * Valida se a string parece uma secret DarkPay real (não máscara).
 * Máscaras tipo sk_live_…xxxx ou sk_••••…abcd são rejeitadas.
 * Aceita chaves antigas (base64url encurtado) e novas (hex longo).
 */
export function isValidApiSecretFormat(secret: string): boolean {
  const s = secret.trim();
  if (!s.startsWith("sk_live_") && !s.startsWith("sk_test_")) return false;
  // máscara da UI — nunca é a secret real
  if (s.includes("…") || s.includes("•") || s.includes("...")) return false;
  // sk_live_ (8) + pelo menos 12 chars de entropia
  if (s.length < 20) return false;
  return /^sk_(live|test)_[a-zA-Z0-9]+$/.test(s);
}

export type ApiKeyAuthFailure =
  | "missing"
  | "masked"
  | "invalid"
  | "inactive"
  | "expired"
  | "public_mismatch"
  | "blocked";

/** Resultado detalhado para mensagens corretas (não tudo “expirada”). */
export async function authenticateApiKeyDetailed(req: Request): Promise<{
  auth: ApiCredentialAuth | null;
  failure: ApiKeyAuthFailure | null;
}> {
  if (!isDatabaseConfigured()) return { auth: null, failure: "missing" };

  let secret: string | null = null;
  let publicKeyHeader: string | null = null;

  const authHdr =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (authHdr.toLowerCase().startsWith("bearer ")) {
    const t = authHdr.slice(7).trim();
    if (t.startsWith("sk_")) secret = t;
  } else if (authHdr.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(authHdr.slice(6).trim(), "base64").toString(
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

  if (!secret) return { auth: null, failure: "missing" };

  if (
    secret.includes("…") ||
    secret.includes("•") ||
    secret.includes("...") ||
    secret.length < 20
  ) {
    return { auth: null, failure: "masked" };
  }

  if (!isValidApiSecretFormat(secret)) {
    return { auth: null, failure: "invalid" };
  }

  try {
    const hash = hashApiSecret(secret);
    const row = await prisma.apiCredential.findFirst({
      where: { secretKeyHash: hash },
      include: { user: true },
    });
    if (!row) return { auth: null, failure: "invalid" };
    if (!row.active) return { auth: null, failure: "inactive" };
    if (row.user.status === "bloqueado") {
      return { auth: null, failure: "blocked" };
    }

    // Secret correta manda — public key opcional (não derruba auth se divergir)
    // (antes: mismatch de pk_ após rotacionar gerava “expirada” falso)

    const meta = parsePermissions(row.permissions);
    if (isExpired(meta.expiresAt)) {
      return { auth: null, failure: "expired" };
    }

    void prisma.apiCredential
      .update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => null);

    return {
      auth: {
        credentialId: row.id,
        userId: row.userId,
        permissions: meta.scopes,
        requireManualSaqueApproval: meta.requireManualSaqueApproval,
        env: meta.env,
        publicKey: row.publicKey,
      },
      failure: null,
    };
  } catch {
    return { auth: null, failure: "invalid" };
  }
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
  // public: 18 bytes hex = 36 chars · secret: 32 bytes hex = 64 chars (estável)
  const publicKey = `pk_${prefix}_${randomKeyPart(18)}`;
  const secretKey = `sk_${prefix}_${randomKeyPart(32)}`;
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
  const { auth } = await authenticateApiKeyDetailed(req);
  return auth;
}

export function messageForApiKeyFailure(
  failure: ApiKeyAuthFailure | null
): string {
  switch (failure) {
    case "masked":
      return "Chave de API incompleta (máscara). Em Integrações → API, rotacione e copie a secret completa — não use sk_••••…xxxx.";
    case "expired":
      return "Chave de API expirada. Realize o reset (rotacionar) da sua chave em Integrações → API.";
    case "inactive":
      return "Credencial de API desativada. Ative ou crie outra em Integrações → API.";
    case "blocked":
      return "Conta bloqueada.";
    case "invalid":
      return "Chave de API inválida. Confira se copiou a secret completa ou rotacione em Integrações → API.";
    case "public_mismatch":
      return "Chave pública não confere com a secret. Use o par pk_/sk_ gerado juntos.";
    default:
      return "Não autenticado. Use Authorization: Bearer sk_live_… ou faça login no painel.";
  }
}

export function hasPermission(
  auth: ApiCredentialAuth,
  perm: ApiPermission
): boolean {
  return auth.permissions.includes(perm);
}
