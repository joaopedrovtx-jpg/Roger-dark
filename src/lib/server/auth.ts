/**
 * Auth REAL — MySQL (Prisma) + cookie httpOnly (+ Bearer opcional).
 */

import { cookies } from "next/headers";
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

function toAuthUser(u: {
  id: string;
  name: string;
  email: string;
  status: string;
  roles: unknown;
  avatarUrl?: string | null;
  displayName?: string | null;
}): AuthUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status as AuthUser["status"],
    roles: rolesFromJson(u.roles),
    avatarUrl: u.avatarUrl ?? null,
    displayName: u.displayName ?? undefined,
  };
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

export async function createSessionForUser(
  userId: string,
  meta?: { ip?: string; userAgent?: string }
): Promise<{ session: Session; token: string }> {
  await assertDatabase();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("Usuário não encontrado");
  if (user.status === "bloqueado") {
    throw new Error("Conta bloqueada. Fale com o suporte.");
  }

  const token = newId("tok");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.session.create({
    data: {
      id: newId("ses"),
      userId: user.id,
      token,
      expiresAt,
      ip: meta?.ip,
      userAgent: meta?.userAgent?.slice(0, 500),
    },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    token,
    session: {
      user: toAuthUser(user),
      token,
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
  if (input.password.length < 6) {
    throw new Error("Senha mínima: 6 caracteres.");
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new Error("Este e-mail já está cadastrado.");

  const id = newId("usr");
  const passwordHash = await hashPassword(input.password);
  await prisma.user.create({
    data: {
      id,
      name: input.name.trim(),
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
    await sendWelcomeEmail(email, input.name.trim());
  } catch {
    /* ignore */
  }
  return session;
}

export async function logoutByToken(token: string | undefined) {
  if (!token) return;
  try {
    await assertDatabase();
    await prisma.session.deleteMany({ where: { token } });
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

  const ses = await prisma.session.findUnique({
    where: { token: token.trim() },
    include: { user: true },
  });
  if (!ses) return null;
  if (ses.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: ses.id } }).catch(() => null);
    return null;
  }
  if (ses.user.status === "bloqueado") return null;
  return toAuthUser(ses.user);
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
 * secure só em HTTPS real (evita falha em localhost com npm start / production).
 */
export function sessionCookieOptions(token: string, req?: Request) {
  const proto =
    req?.headers.get("x-forwarded-proto") ||
    (typeof process !== "undefined" && process.env.COOKIE_SECURE === "1"
      ? "https"
      : "");
  const secure =
    process.env.COOKIE_SECURE === "1" ||
    proto === "https" ||
    (process.env.NODE_ENV === "production" &&
      process.env.FORCE_INSECURE_COOKIE !== "1" &&
      !!process.env.VERCEL);

  // Em local (http://localhost) NUNCA usar Secure, senão o browser descarta o cookie
  const isLocalDev =
    !proto ||
    proto === "http" ||
    process.env.NODE_ENV !== "production" ||
    process.env.FORCE_INSECURE_COOKIE === "1";

  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isLocalDev ? false : secure,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export { COOKIE as SESSION_COOKIE_NAME };
