import { randomBytes } from "crypto";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const attempts = new Map<string, number[]>();

function prune(key: string) {
  const now = Date.now();
  const timestamps = attempts.get(key);
  if (!timestamps) return;
  const fresh = timestamps.filter((t) => now - t < WINDOW_MS);
  if (fresh.length === 0) {
    attempts.delete(key);
  } else {
    attempts.set(key, fresh);
  }
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function warnWeakSecrets(): void {
  if (!isProduction()) return;
  const sec =
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (sec.length < 32 || /change-me|darkpay-dev|example/i.test(sec)) {
    console.warn(
      "[security] SESSION_SECRET fraco ou de exemplo em produção gere com: openssl rand -hex 32"
    );
  }
  if (!process.env.PODPAY_WEBHOOK_SECRET?.trim()) {
    console.warn(
      "[security] PODPAY_WEBHOOK_SECRET ausente em produção webhooks PodPay falharão"
    );
  }
}

export function isMockAllowed(): boolean {
  if (isProduction()) return false;
  return process.env.ALLOW_MOCK_DATA === "1";
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
    ...(isProduction()
      ? {
          "Strict-Transport-Security":
            "max-age=63072000; includeSubDomains; preload",
        }
      : {}),
  };
}

export async function checkLoginRateLimit(key: string): Promise<{
  ok: boolean;
  retryAfterSec?: number;
}> {
  prune(key);
  const timestamps = attempts.get(key) ?? [];

  if (timestamps.length >= MAX_ATTEMPTS) {
    const oldest = timestamps[0] ?? Date.now();
    const retryAfterMs = WINDOW_MS - (Date.now() - oldest);
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  timestamps.push(Date.now());
  attempts.set(key, timestamps);
  return { ok: true };
}

export async function clearLoginRateLimit(key: string) {
  attempts.delete(key);
}

export const MIN_PASSWORD_LENGTH = 10;

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Senha deve conter letras e números.";
  }
  return null;
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
