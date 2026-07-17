/**
 * Utilitários de segurança (produção / hardening).
 */

import { randomBytes } from "crypto";

/** Ambiente de produção real (não desenvolvimento local). */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Aviso em boot se secrets fracos (não bloqueia — só log). */
export function warnWeakSecrets(): void {
  if (!isProduction()) return;
  const sec =
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (sec.length < 32 || /change-me|darkpay-dev|example/i.test(sec)) {
    console.warn(
      "[security] SESSION_SECRET fraco ou de exemplo em produção — gere com: openssl rand -hex 32"
    );
  }
  if (!process.env.PODPAY_WEBHOOK_SECRET?.trim()) {
    console.warn(
      "[security] PODPAY_WEBHOOK_SECRET ausente em produção — webhooks PodPay falharão"
    );
  }
}

/** Mock / simulação proibidos em produção. */
export function isMockAllowed(): boolean {
  if (isProduction()) return false;
  return process.env.ALLOW_MOCK_DATA === "1";
}

/** Token de sessão criptograficamente forte (não usa Date/Math.random). */
export function generateSecureToken(prefix = "tok"): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

/** Headers de segurança HTTP (CSP leve + anti-clickjacking). */
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

/** Rate limit simples em memória (por IP/chave). */
const loginAttempts = new Map<
  string,
  { count: number; resetAt: number }
>();

const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX = 10;

export function checkLoginRateLimit(key: string): {
  ok: boolean;
  retryAfterSec?: number;
} {
  const now = Date.now();
  const row = loginAttempts.get(key);
  if (!row || row.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { ok: true };
  }
  if (row.count >= LOGIN_MAX) {
    return {
      ok: false,
      retryAfterSec: Math.ceil((row.resetAt - now) / 1000),
    };
  }
  row.count += 1;
  return { ok: true };
}

export function clearLoginRateLimit(key: string) {
  loginAttempts.delete(key);
}

/** Senha mínima (Sprint 1) */
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

/** Seller só movimenta dinheiro se ativo */
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
