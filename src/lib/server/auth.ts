/**
 * Auth REAL MySQL (Prisma) + cookie httpOnly (+ Bearer opcional).
 */

import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import type {
  AuthUser,
  LoginInput,
  RegisterInput,
  Role,
  Session,
} from "@/lib/domain/types";

const COOKIE = "darkpay_session";
const SESSION_DAYS = 7;

function rolesFromJson(raw: unknown): Role[] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw.split(",").map((s) => s.trim());
    }
  }
  if (Array.isArray(value)) {
    const roles = value
      .map((r) => String(r).toLowerCase())
      .filter((r): r is Role =>
        r === "seller" || r === "admin" || r === "manager"
      );
    return roles.length ? roles : ["seller"];
  }
  return ["seller"];
}

function toAuthUser(
  u: {
    id: string;
    name: string;
    email: string;
    status: string;
    roles: unknown;
    avatarUrl?: string | null;
    displayName?: string | null;
  },
  extras?: { twoFactorEnabled?: boolean; mustSetup2fa?: boolean }
): AuthUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status as AuthUser["status"],
    roles: rolesFromJson(u.roles),
    avatarUrl: u.avatarUrl ?? null,
    displayName: u.displayName ?? undefined,
    twoFactorEnabled: extras?.twoFactorEnabled,
    mustSetup2fa: extras?.mustSetup2fa,
  };
}

/** Enriquece AuthUser com flags 2FA (policy admin) + KYC + permissões de gerente. */
export async function enrichAuthUser(user: AuthUser): Promise<AuthUser> {
  let next: AuthUser = { ...user };
  try {
    const {
      userHas2faEnabled,
      adminMustSetup2fa,
    } = await import("@/lib/server/admin-2fa-policy");
    const twoFactorEnabled = await userHas2faEnabled(user.id);
    const mustSetup2fa = await adminMustSetup2fa(user.id, user.roles);
    next = { ...next, twoFactorEnabled, mustSetup2fa };
  } catch {
    /* policy best-effort */
  }

  try {
    const { buildKyc } = await import("@/lib/kyc");
    const docs = await prisma.document.findMany({
      where: { userId: user.id },
      select: { kind: true, status: true },
    });
    next = {
      ...next,
      kyc: buildKyc(user.status, docs),
    };
  } catch {
    const { buildKyc } = await import("@/lib/kyc");
    next = { ...next, kyc: buildKyc(user.status, []) };
  }

  // Gerente: carrega permissões do registro Manager
  try {
    if (user.roles.includes("manager") && !user.roles.includes("admin")) {
      const mgr = await prisma.manager.findFirst({
        where: {
          OR: [{ originUserId: user.id }, { email: user.email.toLowerCase() }],
        },
        select: { permissions: true, status: true },
      });
      if (mgr) {
        const perms = Array.isArray(mgr.permissions)
          ? (mgr.permissions as string[])
          : [];
        next = { ...next, permissions: perms };
        // Gerente inativo perde acesso staff (sem role na sessão checado no guard)
        if (mgr.status === "inativo") {
          next = {
            ...next,
            roles: next.roles.filter((r) => r !== "manager"),
            permissions: [],
          };
        }
      }
    }
  } catch {
    /* ignore */
  }

  return next;
}

function newId(prefix: string) {
  return `${prefix}_${randomBytes(24).toString("base64url")}`;
}

export async function assertDatabase(): Promise<void> {
  if (!isDatabaseConfigured()) {
    throw new Error(
      "DATABASE_URL não configurada. Configure o MySQL no arquivo .env"
    );
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new Error(
      "Não foi possível conectar ao MySQL. Suba o banco e confira DATABASE_URL."
    );
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

import { createHash } from "crypto";

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createSessionForUser(
  userId: string,
  meta?: { ip?: string; userAgent?: string }
): Promise<{ session: Session; token: string; rawToken: string }> {
  await assertDatabase();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuário não encontrado");
  if (user.status === "bloqueado") {
    throw new Error("Conta bloqueada. Fale com o suporte.");
  }

  // Token forte (32 bytes) — armazenamos apenas o hash no DB
  const { generateSecureToken } = await import("@/lib/server/security");
  const rawToken = generateSecureToken("tok");
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.session.create({
    data: {
      id: newId("ses"),
      userId: user.id,
      token: tokenHash,
      expiresAt,
      ip: meta?.ip,
      userAgent: meta?.userAgent?.slice(0, 500),
    },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Cookie assinado: middleware valida exp+HMAC; API valida hash do token no DB
  const { packSessionCookie } = await import("@/lib/server/signed-token");
  const cookieToken = packSessionCookie(rawToken, expiresAt, user.status);

  const base = toAuthUser(user);
  const enriched = await enrichAuthUser(base);

  return {
    token: cookieToken,
    rawToken,
    session: {
      user: enriched,
      token: cookieToken,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

export async function loginWithPassword(
  input: LoginInput,
  meta?: { ip?: string; userAgent?: string }
): Promise<Session> {
  await assertDatabase();

  const email = input.email.trim().toLowerCase();
  const password = input.password;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("E-mail ou senha inválidos.");
  if (!user.passwordHash) {
    throw new Error("Conta sem senha. Rode: npm run db:seed");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new Error("E-mail ou senha inválidos.");
  if (user.status === "bloqueado") {
    throw new Error("Conta bloqueada. Fale com o suporte.");
  }
  const { session } = await createSessionForUser(user.id, meta);
  return session;
}

export async function registerWithPassword(
  input: RegisterInput,
  meta?: { ip?: string; userAgent?: string }
): Promise<Session> {
  await assertDatabase();

  const email = input.email.trim().toLowerCase();
  const { validatePasswordStrength } = await import("@/lib/server/security");
  const pwdErr = validatePasswordStrength(input.password);
  if (pwdErr) throw new Error(pwdErr);

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new Error("Este e-mail já está cadastrado.");

  const { sanitizeDisplayName } = await import("@/lib/server/security");
  const safeName = sanitizeDisplayName(input.name);
  if (safeName.length < 2) throw new Error("Nome inválido.");

  const id = newId("usr");
  const passwordHash = await hashPassword(input.password);
  await prisma.user.create({
    data: {
      id,
      name: safeName,
      email,
      phone: input.phone?.replace(/\D/g, "") || null,
      passwordHash,
      status: "pendente",
      roles: ["seller"],
      personType: "pf",
    },
  });
  await prisma.user2FA.create({
    data: { userId: id, enabled: false },
  });
  await prisma.notificationSetting.create({
    data: { userId: id },
  });

  const { session } = await createSessionForUser(id, meta);
  try {
    const { sendWelcomeEmail } = await import("@/lib/server/email");
    await sendWelcomeEmail(email, safeName);
  } catch {
    /* ignore */
  }
  return session;
}

export async function logoutByToken(token: string | undefined) {
  if (!token) return;
  try {
    await assertDatabase();
    // Cookie assinado (payload.sig) ou legado: sempre apaga o rawToken no DB
    let raw = token.trim();
    try {
      const { unpackSessionCookie } = await import("@/lib/server/signed-token");
      const unpacked = unpackSessionCookie(raw);
      if (unpacked.ok) raw = unpacked.token;
    } catch {
      /* legado */
    }
    const tokenHash = hashSessionToken(raw);
    await prisma.session.deleteMany({ where: { token: tokenHash } });
  } catch {
    /* cookie ainda é limpo na route */
  }
}

export async function getUserBySessionToken(
  token: string | undefined | null
): Promise<AuthUser | null> {
  if (!token?.trim()) return null;
  try {
    await assertDatabase();
  } catch {
    return null;
  }

  // Cookie assinado (token|exp.hmac) ou legado (só token)
  let raw = token.trim();
  try {
    const { unpackSessionCookie } = await import("@/lib/server/signed-token");
    const unpacked = unpackSessionCookie(raw);
    if (unpacked.ok) {
      raw = unpacked.token;
    } else if (unpacked.reason === "expired" || unpacked.reason === "sig") {
      // cookie assinado inválido/expirado
      if (raw.includes(".")) return null;
      // legado sem ponto: tenta DB
    }
  } catch {
    /* continue */
  }

  const tokenHash = hashSessionToken(raw);
  const ses = await prisma.session.findUnique({
    where: { token: tokenHash },
    include: { user: true },
  });
  if (!ses) return null;
  if (ses.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: ses.id } }).catch(() => null);
    return null;
  }
  if (ses.user.status === "bloqueado") return null;
  return enrichAuthUser(toAuthUser(ses.user));
}

/** Extrai token do cookie e/ou Authorization: Bearer */
export function extractTokenFromRequest(req?: Request | null): string | null {
  if (req) {
    const auth = req.headers.get("authorization") || req.headers.get("Authorization");
    if (auth?.toLowerCase().startsWith("bearer ")) {
      const t = auth.slice(7).trim();
      if (t) return t;
    }
    // cookie header manual (middleware / edge)
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(
      new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`)
    );
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

/** Lê cookie no Server Component / Route Handler (+ Bearer se req passado) */
export async function getSessionUser(
  req?: Request | null
): Promise<AuthUser | null> {
  let token = extractTokenFromRequest(req ?? null);
  if (!token) {
    try {
      const jar = await cookies();
      token = jar.get(COOKIE)?.value ?? null;
    } catch {
      token = null;
    }
  }
  return getUserBySessionToken(token);
}

/**
 * Cookie de sessão.
 * Secure ON quando a request é HTTPS (ou prod em hosts como Vercel).
 * Em localhost http o Secure fica OFF (browser descartaria o cookie).
 */
export function sessionCookieOptions(token: string, req?: Request) {
  const forwardedProto = req?.headers.get("x-forwarded-proto")?.toLowerCase();
  const isHttps =
    forwardedProto === "https" ||
    (process.env.COOKIE_SECURE === "1" && process.env.NODE_ENV === "production");

  const forceInsecure = process.env.FORCE_INSECURE_COOKIE === "1";
  const isProd = process.env.NODE_ENV === "production";

  const secure = !forceInsecure && (isHttps || (isProd && !!process.env.VERCEL) || process.env.COOKIE_SECURE === "1");

  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export { COOKIE as SESSION_COOKIE_NAME };
