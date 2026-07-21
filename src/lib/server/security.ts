import { randomBytes } from "crypto";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_COMBO = 10;
const MAX_ATTEMPTS_EMAIL = 25;
const MAX_ATTEMPTS_IP = 40;
const MAX_REGISTER_IP = 8;
const MAX_MAP_SIZE = 10_000;

const attempts = new Map<string, number[]>();

function evictStale() {
  if (attempts.size <= MAX_MAP_SIZE) return;
  const entries = [...attempts.entries()].sort(
    (a, b) => (a[1][a[1].length - 1] ?? 0) - (b[1][b[1].length - 1] ?? 0)
  );
  const toDelete = entries.slice(0, Math.floor(MAX_MAP_SIZE * 0.2));
  for (const [k] of toDelete) attempts.delete(k);
}

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

/**
 * IP do cliente. Só confia em X-Forwarded-For se TRUST_PROXY=1
 * (proxy reverso sobrescreve o header).
 */
export function getClientIp(req: Request): string {
  // Só confia em XFF/X-Real-IP com TRUST_PROXY=1 (nginx/caddy sobrescreve o header).
  // Nunca default em production sem flag — evita spoof de rate limit.
  const trust =
    process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true";

  if (trust) {
    const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff && /^[\w.:a-fA-F%]+$/.test(xff) && xff.length < 64) return xff;
    const real = req.headers.get("x-real-ip")?.trim();
    if (real && real.length < 64) return real;
  }

  // Sem proxy confiável: não usa XFF controlado pelo cliente
  return "direct";
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

async function checkRateLimit(
  key: string,
  max: number
): Promise<{ ok: boolean; retryAfterSec?: number }> {
  evictStale();
  prune(key);
  const timestamps = attempts.get(key) ?? [];

  if (timestamps.length >= max) {
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

/** Rate limit login: combo IP+email, email global, IP global */
export async function checkLoginRateLimit(opts: {
  ip: string;
  email: string;
}): Promise<{ ok: boolean; retryAfterSec?: number }> {
  const email = opts.email.trim().toLowerCase();
  const ip = opts.ip || "direct";

  const checks = await Promise.all([
    checkRateLimit(`login:combo:${ip}:${email}`, MAX_ATTEMPTS_COMBO),
    checkRateLimit(`login:email:${email}`, MAX_ATTEMPTS_EMAIL),
    checkRateLimit(`login:ip:${ip}`, MAX_ATTEMPTS_IP),
  ]);

  for (const c of checks) {
    if (!c.ok) return c;
  }
  return { ok: true };
}

/** Compat: chave única legada */
export async function checkLoginRateLimitKey(key: string): Promise<{
  ok: boolean;
  retryAfterSec?: number;
}> {
  return checkRateLimit(`login:legacy:${key}`, MAX_ATTEMPTS_COMBO);
}

export async function clearLoginRateLimit(opts: {
  ip: string;
  email: string;
}) {
  const email = opts.email.trim().toLowerCase();
  const ip = opts.ip || "direct";
  attempts.delete(`login:combo:${ip}:${email}`);
  attempts.delete(`login:email:${email}`);
  attempts.delete(`login:ip:${ip}`);
}

export async function checkRegisterRateLimit(ip: string): Promise<{
  ok: boolean;
  retryAfterSec?: number;
}> {
  return checkRateLimit(`register:ip:${ip || "direct"}`, MAX_REGISTER_IP);
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

/** Nome de exibição seguro (anti stored XSS) */
export function sanitizeDisplayName(raw: string, maxLen = 80): string {
  let s = raw.normalize("NFKC").trim();
  // remove tags HTML e caracteres de controle / markup
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

/** Arredonda para centavos (mitiga Float IEEE754) */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
