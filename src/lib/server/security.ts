import { randomBytes } from "crypto";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { env } from "@/lib/env";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_COMBO = 10;
const MAX_ATTEMPTS_EMAIL = 25;
const MAX_ATTEMPTS_IP = 40;
const MAX_REGISTER_IP = 8;
const MAX_2FA_COMBO = 8;
const MAX_2FA_IP = 30;

export function isProduction(): boolean {
  return env.NODE_ENV === "production";
}

export function getClientIp(req: Request): string {
  const trust = env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true";
  if (trust) {
    const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff && /^[\w.:a-fA-F%]+$/.test(xff) && xff.length < 64) return xff;
    const real = req.headers.get("x-real-ip")?.trim();
    if (real && real.length < 64) return real;
  }
  return "unknown";
}

export function warnWeakSecrets(): void {
  const sec =
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (sec.length < 32 || /change-me|darkpay-dev|example/i.test(sec)) {
    console.warn(
      "[security] SESSION_SECRET fraco ou ausente — gere: openssl rand -hex 32"
    );
  }
  if (!process.env.PODPAY_WEBHOOK_SECRET?.trim()) {
    console.warn(
      "[security] PODPAY_WEBHOOK_SECRET ausente — webhooks PodPay serão rejeitados"
    );
  }
  if (!process.env.VELANA_WEBHOOK_SECRET?.trim()) {
    console.warn(
      "[security] VELANA_WEBHOOK_SECRET ausente — webhooks Velana serão rejeitados"
    );
  }
  if (isProduction() && process.env.ALLOW_UNSIGNED_WEBHOOKS === "1") {
    console.error(
      "[security] ALLOW_UNSIGNED_WEBHOOKS ignorado em produção (fail-closed)"
    );
  }
}

export function isMockAllowed(): boolean {
  if (isProduction()) return false;
  return env.ALLOW_MOCK_DATA === "1";
}

export function generateSecureToken(prefix = "tok"): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-DNS-Prefetch-Control": "off",
    // CSP de API (JSON). Turnstile só no HTML — ver next.config.ts.
    "Content-Security-Policy":
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    ...(isProduction()
      ? {
          "Strict-Transport-Security":
            "max-age=63072000; includeSubDomains; preload",
        }
      : {}),
  };
}

/** Fallback em memória quando a tabela rate_limits ainda não existe. */
const memoryAttempts = new Map<string, { count: number; expiresAt: number }>();
const MAX_MEMORY_KEYS = 20_000;

function checkRateLimitMemory(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const cur = memoryAttempts.get(key);
  if (!cur || cur.expiresAt <= now) {
    if (memoryAttempts.size > MAX_MEMORY_KEYS) {
      for (const [k, v] of memoryAttempts) {
        if (v.expiresAt <= now) memoryAttempts.delete(k);
      }
    }
    memoryAttempts.set(key, { count: 1, expiresAt: now + windowMs });
    return { ok: true };
  }
  cur.count += 1;
  if (cur.count > max) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((cur.expiresAt - now) / 1000)),
    };
  }
  return { ok: true };
}

function clearRateLimitMemory(key: string): void {
  memoryAttempts.delete(key);
}

/**
 * Rate limit com janela fixa:
 * - 1ª tentativa cria contador + expiresAt = now + window
 * - tentativas seguintes incrementam; NÃO estendem a janela
 * - após expiresAt, contador zera
 *
 * Persistência em `rate_limits`. Se a tabela falhar:
 * - produção: fallback memória (ainda limita) + log
 * - sem DB: memória
 */
async function checkRateLimitDb(
  key: string,
  max: number,
  windowMs: number = WINDOW_MS
): Promise<{ ok: boolean; retryAfterSec?: number }> {
  const { prisma } = await import("@/lib/server/prisma");
  if (!isDatabaseConfigured()) {
    return checkRateLimitMemory(key, max, windowMs);
  }

  const now = new Date();
  const nowMs = now.getTime();

  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } });

    if (!existing || existing.expiresAt.getTime() <= nowMs) {
      const expiresAt = new Date(nowMs + windowMs);
      await prisma.rateLimit.upsert({
        where: { key },
        create: {
          id: `rl_${randomBytes(8).toString("hex")}`,
          key,
          attempts: 1,
          expiresAt,
        },
        update: {
          attempts: 1,
          expiresAt,
        },
      });
      return { ok: true };
    }

    const row = await prisma.rateLimit.update({
      where: { key },
      data: { attempts: { increment: 1 } },
    });

    if (row.attempts > max) {
      return {
        ok: false,
        retryAfterSec: Math.max(
          1,
          Math.ceil((row.expiresAt.getTime() - nowMs) / 1000)
        ),
      };
    }
    return { ok: true };
  } catch (e) {
    // Tabela ausente / Prisma offline: não falhar aberto em prod.
    if (isProduction()) {
      console.warn(
        "[security] rate_limit_db_failed_fallback_memory",
        e instanceof Error ? e.message : String(e)
      );
    }
    return checkRateLimitMemory(key, max, windowMs);
  }
}

async function clearRateLimitDb(key: string): Promise<void> {
  clearRateLimitMemory(key);
  const { prisma } = await import("@/lib/server/prisma");
  if (!isDatabaseConfigured()) return;
  try {
    await prisma.rateLimit.deleteMany({ where: { key } });
  } catch {
    /* best-effort */
  }
}

function rateKey(type: string, ...parts: string[]): string {
  return `${type}:${parts.join(":")}`;
}

export async function checkLoginRateLimit(opts: {
  ip: string;
  email: string;
}): Promise<{ ok: boolean; retryAfterSec?: number }> {
  const email = opts.email.trim().toLowerCase();
  const ip = opts.ip || "direct";

  const checks = await Promise.all([
    checkRateLimitDb(rateKey("login", "combo", ip, email), MAX_ATTEMPTS_COMBO),
    checkRateLimitDb(rateKey("login", "email", email), MAX_ATTEMPTS_EMAIL),
    checkRateLimitDb(rateKey("login", "ip", ip), MAX_ATTEMPTS_IP),
  ]);

  for (const c of checks) {
    if (!c.ok) return c;
  }
  return { ok: true };
}

export async function checkLoginRateLimitKey(key: string): Promise<{
  ok: boolean;
  retryAfterSec?: number;
}> {
  return checkRateLimitDb(rateKey("login", "legacy", key), MAX_ATTEMPTS_COMBO);
}

export async function clearLoginRateLimit(opts: {
  ip: string;
  email: string;
}) {
  const email = opts.email.trim().toLowerCase();
  const ip = opts.ip || "direct";
  await Promise.all([
    clearRateLimitDb(rateKey("login", "combo", ip, email)),
    clearRateLimitDb(rateKey("login", "email", email)),
    clearRateLimitDb(rateKey("login", "ip", ip)),
  ]);
}

export async function checkRegisterRateLimit(ip: string): Promise<{
  ok: boolean;
  retryAfterSec?: number;
}> {
  return checkRateLimitDb(rateKey("register", "ip", ip || "direct"), MAX_REGISTER_IP);
}

export async function check2faRateLimit(opts: {
  ip: string;
  userId: string;
}): Promise<{ ok: boolean; retryAfterSec?: number }> {
  const ip = opts.ip || "direct";
  const userId = opts.userId || "unknown";
  const checks = await Promise.all([
    checkRateLimitDb(rateKey("2fa", "combo", ip, userId), MAX_2FA_COMBO),
    checkRateLimitDb(rateKey("2fa", "ip", ip), MAX_2FA_IP),
  ]);
  for (const c of checks) {
    if (!c.ok) return c;
  }
  return { ok: true };
}

export async function clear2faRateLimit(opts: {
  ip: string;
  userId: string;
}) {
  const ip = opts.ip || "direct";
  const userId = opts.userId || "unknown";
  await Promise.all([
    clearRateLimitDb(rateKey("2fa", "combo", ip, userId)),
    clearRateLimitDb(rateKey("2fa", "ip", ip)),
  ]);
}

export const MIN_PASSWORD_LENGTH = 10;

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Senha deve conter letras e números.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Senha deve conter pelo menos uma letra maiúscula.";
  }
  if (!/[a-z]/.test(password)) {
    return "Senha deve conter pelo menos uma letra minúscula.";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Senha deve conter pelo menos um caractere especial.";
  }
  return null;
}

export function sanitizeDisplayName(raw: string, maxLen = 80): string {
  let s = raw.normalize("NFKC").trim();
  s = s.replace(/<[^>]*>/g, "");
  s = s.replace(/[\u0000-\u001F\u007F<>`"{}\\/]/g, "");
  s = s.replace(/\s+/g, " ");
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export function assertSellerCanTransact(status: string): void {
  if (status === "bloqueado") {
    throw new Error("Conta bloqueada. Fale com o suporte.");
  }
  if (status === "pendente") {
    throw new Error(
      "Conta pendente de aprovação. Complete o cadastro e aguarde a análise."
    );
  }
}

export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export async function cleanupStaleRateLimits(): Promise<void> {
  const { prisma } = await import("@/lib/server/prisma");
  if (!isDatabaseConfigured()) return;
  try {
    await prisma.rateLimit.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  } catch {
    /* best-effort */
  }
}
