/**
 * Credenciais de API do seller (Integrações → API).
 * Formato gateway:
 *   publicKey  pk_live_… | pk_test_…
 *   secretKey  sk_live_… | sk_test_…
 *
 * Secret fica com hash (auth) + cópia cifrada (painel: ver/copiar pelo dono).
 * DarkPay intermedia com a adquirente no servidor o seller nunca vê sk_ da PodPay.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import type { Prisma } from "@prisma/client";
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
  /**
   * Secret cifrada do painel (AES).
   * Guardada no JSON `permissions` para funcionar mesmo se a coluna
   * `secretKeyEnc` não existir no Prisma Client em runtime (hot-reload).
   * Nunca exposta ao cliente como campo de permissão.
   */
  skEnc?: string | null;
};

export type ApiCredentialPublic = {
  id: string;
  name: string;
  publicKey: string;
  /** null após listagem só preenchida em create/rotate */
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

/** Hint visual NUNCA deve ser montado de volta como sk_ completa na UI */
export function secretHint(secret: string): string {
  const s = secret.trim();
  if (s.length <= 12) return "••••••••";
  return `••••…${s.slice(-4)}`;
}

function secretEncKey(): Buffer {
  const raw =
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "darkpay-dev-secret-key-change-me!!";
  return createHash("sha256").update(raw).digest();
}

/**
 * Valida se a string parece uma secret DarkPay real (não máscara).
 * Máscaras tipo sk_live_…xxxx ou sk_••••…abcd são rejeitadas.
 * Aceita chaves antigas (base64url encurtado) e novas (hex longo).
 */
export function isValidApiSecretFormat(secret: string): boolean {
  const s = secret.trim();
  if (!s.startsWith("sk_live_") && !s.startsWith("sk_test_")) return false;
  // máscara da UI nunca é a secret real
  if (s.includes("…") || s.includes("•") || s.includes("...")) return false;
  // sk_live_ (8) + pelo menos 12 chars de entropia
  if (s.length < 20) return false;
  return /^sk_(live|test)_[a-zA-Z0-9]+$/.test(s);
}

/** AES-256-GCM: "v1:" + iv_b64 + ":" + tag_b64 + ":" + data_b64 */
export function encryptApiSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretEncKey(), iv);
  const enc = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptApiSecret(payload: string | null | undefined): string | null {
  if (!payload || !payload.startsWith("v1:")) return null;
  try {
    const parts = payload.split(":");
    if (parts.length !== 4) return null;
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const data = Buffer.from(parts[3], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", secretEncKey(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    const secret = dec.toString("utf8");
    return isValidApiSecretFormat(secret) ? secret : null;
  } catch {
    return null;
  }
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

    // Secret correta manda public key opcional (não derruba auth se divergir)
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
    skEnc: null,
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
      skEnc: typeof o.skEnc === "string" && o.skEnc ? o.skEnc : null,
    };
  }
  return defaults;
}

/** Payload JSON persistido (inclui skEnc; client só vê scopes). */
function permissionsJson(meta: ApiCredentialMeta): Prisma.InputJsonValue {
  return {
    scopes: meta.scopes,
    requireManualSaqueApproval: meta.requireManualSaqueApproval,
    expiresAt: meta.expiresAt,
    env: meta.env,
    ...(meta.skEnc ? { skEnc: meta.skEnc } : {}),
  };
}

function isUnknownPrismaArgError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Unknown argument") ||
    msg.includes("secretKeyEnc") ||
    msg.includes("Unknown arg")
  );
}

/** Decifra secret do dono: coluna secretKeyEnc OU JSON permissions.skEnc */
function resolveOwnerSecret(
  row: { secretKeyEnc?: string | null; permissions?: unknown },
  explicit: string | null = null
): string | null {
  if (explicit && isValidApiSecretFormat(explicit)) return explicit;
  const fromCol = decryptApiSecret(
    (row as { secretKeyEnc?: string | null }).secretKeyEnc
  );
  if (fromCol) return fromCol;
  const meta = parsePermissions(row.permissions);
  return decryptApiSecret(meta.skEnc) || null;
}

/**
 * Create/update com secretKeyEnc quando o client Prisma conhece o campo.
 * Fallback automático se o client em memória estiver desatualizado (hot-reload).
 */
async function createCredentialRow(data: {
  id: string;
  userId: string;
  name: string;
  publicKey: string;
  secretKeyHash: string;
  secretKeyHint: string;
  secretEnc: string;
  permissions: Prisma.InputJsonValue;
}) {
  const base: Prisma.ApiCredentialUncheckedCreateInput = {
    id: data.id,
    userId: data.userId,
    name: data.name,
    publicKey: data.publicKey,
    secretKeyHash: data.secretKeyHash,
    secretKeyHint: data.secretKeyHint,
    permissions: data.permissions,
    active: true,
  };
  try {
    return await prisma.apiCredential.create({
      data: {
        ...base,
        secretKeyEnc: data.secretEnc,
      },
    });
  } catch (err) {
    if (!isUnknownPrismaArgError(err)) throw err;
    // Client Prisma antigo / sem coluna: grava só no JSON (skEnc)
    return await prisma.apiCredential.create({ data: base });
  }
}

async function updateCredentialSecrets(
  id: string,
  data: {
    publicKey: string;
    secretKeyHash: string;
    secretKeyHint: string;
    secretEnc: string;
    permissions: Prisma.InputJsonValue;
  }
) {
  const base: Prisma.ApiCredentialUncheckedUpdateInput = {
    publicKey: data.publicKey,
    secretKeyHash: data.secretKeyHash,
    secretKeyHint: data.secretKeyHint,
    permissions: data.permissions,
  };
  try {
    return await prisma.apiCredential.update({
      where: { id },
      data: {
        ...base,
        secretKeyEnc: data.secretEnc,
      },
    });
  } catch (err) {
    if (!isUnknownPrismaArgError(err)) throw err;
    return await prisma.apiCredential.update({
      where: { id },
      data: base,
    });
  }
}

function toPublic(
  row: {
    id: string;
    name: string;
    publicKey: string;
    secretKeyHint: string | null;
    secretKeyEnc?: string | null;
    permissions: unknown;
    active: boolean;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  secretKey: string | null = null
): ApiCredentialPublic {
  const meta = parsePermissions(row.permissions);
  const resolved = resolveOwnerSecret(row, secretKey);
  return {
    id: row.id,
    name: row.name,
    publicKey: row.publicKey,
    secretKey: resolved,
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
  // Retorna secret decifrada ao dono (ver/copiar no painel sem regenerar)
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
  const secretEnc = encryptApiSecret(secretKey);
  const meta: ApiCredentialMeta = {
    scopes: input.permissions?.length ? input.permissions : ["transacoes"],
    requireManualSaqueApproval: !!input.requireManualSaqueApproval,
    expiresAt: input.expiresAt || null,
    env,
    skEnc: secretEnc,
  };

  const row = await createCredentialRow({
    id: newId("cred"),
    userId,
    name: (input.name || "API Integração").trim() || "API Integração",
    publicKey,
    secretKeyHash: hashApiSecret(secretKey),
    secretKeyHint: secretHint(secretKey),
    secretEnc,
    permissions: permissionsJson(meta),
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
  // Preserva skEnc ao editar nome/perms (não apaga a secret do painel)
  const meta: ApiCredentialMeta = {
    scopes: input.permissions ?? prev.scopes,
    requireManualSaqueApproval:
      input.requireManualSaqueApproval ?? prev.requireManualSaqueApproval,
    expiresAt:
      input.expiresAt !== undefined ? input.expiresAt : prev.expiresAt,
    env: prev.env,
    skEnc: prev.skEnc ?? null,
  };

  const row = await prisma.apiCredential.update({
    where: { id: existing.id },
    data: {
      name: input.name?.trim() || existing.name,
      permissions: permissionsJson(meta),
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

  const prev = parsePermissions(existing.permissions);
  const { publicKey, secretKey } = generateKeyPair(prev.env);
  const secretEnc = encryptApiSecret(secretKey);
  const meta: ApiCredentialMeta = {
    ...prev,
    skEnc: secretEnc,
  };

  const row = await updateCredentialSecrets(existing.id, {
    publicKey,
    secretKeyHash: hashApiSecret(secretKey),
    secretKeyHint: secretHint(secretKey),
    secretEnc,
    permissions: permissionsJson(meta),
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
      return "Chave de API incompleta (máscara). Em Integrações → API, rotacione e copie a secret completa não use sk_••••…xxxx.";
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
