/**
 * Verificação server-side do Cloudflare Turnstile (CAPTCHA humano).
 *
 * Fluxo:
 * 1. Cliente obtém site key (build NEXT_PUBLIC_* ou GET /api/v1/public/turnstile).
 * 2. Widget gera token; form envia `turnstileToken`.
 * 3. Servidor valida via siteverify com TURNSTILE_SECRET_KEY + IP.
 *
 * Regras:
 * - Só habilita se site key E secret estiverem configurados (evita captcha cosmético).
 * - Fail-closed quando habilitado (rede CF ou token inválido → rejeita).
 * - Valida hostname e action quando configurados.
 */

import { env } from "@/lib/env";
import { getClientIp } from "@/lib/server/security";
import { log } from "@/lib/server/logger";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Keys dummy oficiais da CF (banner "Somente para teste"). Nunca usar em prod. */
function isDummyKey(key: string): boolean {
  const k = key.trim();
  return (
    /^1x0{10,}/i.test(k) ||
    /^2x0{10,}/i.test(k) ||
    /^3x0{10,}/i.test(k) ||
    k.includes("00000000000000000000")
  );
}

function siteKeyFromEnv(): string {
  // Prefer runtime process.env (VPS .env) over envalid snapshot / build-time inline
  const candidates = [
    process.env.TURNSTILE_SITE_KEY,
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  ];
  for (const raw of candidates) {
    const k = String(raw || "").trim();
    if (k.length >= 8 && !isDummyKey(k)) return k;
  }
  return "";
}

function secretFromEnv(): string {
  const candidates = [
    process.env.TURNSTILE_SECRET_KEY,
    env.TURNSTILE_SECRET_KEY,
  ];
  for (const raw of candidates) {
    const k = String(raw || "").trim();
    if (k.length >= 8 && !isDummyKey(k)) return k;
  }
  return "";
}

/** Hostnames aceitos no siteverify (prod). */
function allowedHostnames(): string[] {
  const raw =
    process.env.TURNSTILE_ALLOWED_HOSTNAMES?.trim() ||
    process.env.APP_URL?.replace(/^https?:\/\//, "").split("/")[0] ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, "").split("/")[0] ||
    "darkpays.online";
  const hosts = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const withWww = new Set<string>();
  for (const h of hosts) {
    withWww.add(h);
    if (h.startsWith("www.")) withWww.add(h.slice(4));
    else withWww.add(`www.${h}`);
  }
  // Dummy keys da CF (testes) podem reportar hostname "example.com"
  withWww.add("example.com");
  withWww.add("localhost");
  return [...withWww];
}

/** true quando captcha deve ser exigido (site key + secret). */
export function isTurnstileServerEnabled(): boolean {
  const site = siteKeyFromEnv();
  const secret = secretFromEnv();
  return site.length >= 8 && secret.length >= 8;
}

/** Site key pública (nunca o secret). */
export function getTurnstileSiteKey(): string | null {
  if (!isTurnstileServerEnabled()) return null;
  return siteKeyFromEnv();
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
  action?: string;
  cdata?: string;
  hostname?: string;
  challengeTs?: string;
}

export interface VerifyTurnstileOptions {
  /** action esperado do widget (ex.: "login" | "register"). */
  expectedAction?: string;
}

/**
 * Verifica token Turnstile. Fail-closed quando habilitado.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  req?: Request,
  opts: VerifyTurnstileOptions = {}
): Promise<VerifyResult> {
  if (!isTurnstileServerEnabled()) {
    return { ok: true };
  }
  if (!token || typeof token !== "string" || token.length < 10) {
    return {
      ok: false,
      error: "Verificação anti-bot ausente. Recarregue a página.",
    };
  }

  const secret = secretFromEnv();
  const ip = req ? getClientIp(req) : undefined;
  const formData = new URLSearchParams();
  formData.append("secret", secret);
  formData.append("response", token);
  if (ip && ip !== "unknown") formData.append("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      log.warn({ status: res.status }, "turnstile_siteverify_http_failed");
      return {
        ok: false,
        error: "Falha ao validar verificação anti-bot (CF). Tente novamente.",
      };
    }

    const json = (await res.json()) as {
      success: boolean;
      "error-codes"?: string[];
      action?: string;
      cdata?: string;
      hostname?: string;
      challenge_ts?: string;
    };

    if (!json.success) {
      const codes = json["error-codes"] ?? [];
      log.warn({ codes }, "turnstile_verification_failed");
      return { ok: false, error: humanizeErrorCodes(codes) };
    }

    // Hostname (mitiga token gerado em outro domínio)
    const hostname = (json.hostname || "").toLowerCase();
    if (hostname) {
      const allowed = allowedHostnames();
      if (!allowed.includes(hostname)) {
        log.warn({ hostname, allowed }, "turnstile_hostname_mismatch");
        return {
          ok: false,
          error: "Verificação anti-bot inválida para este domínio.",
        };
      }
    }

    // Action (login vs register)
    if (opts.expectedAction) {
      const got = (json.action || "").trim();
      if (got && got !== opts.expectedAction) {
        log.warn(
          { expected: opts.expectedAction, got },
          "turnstile_action_mismatch"
        );
        return {
          ok: false,
          error: "Verificação anti-bot inválida. Recarregue a página.",
        };
      }
    }

    return {
      ok: true,
      action: json.action,
      cdata: json.cdata,
      hostname: json.hostname,
      challengeTs: json.challenge_ts,
    };
  } catch (e) {
    log.warn(
      { err: e instanceof Error ? e.message : String(e) },
      "turnstile_siteverify_exception"
    );
    return {
      ok: false,
      error: "Não foi possível validar verificação anti-bot. Tente novamente.",
    };
  }
}

function humanizeErrorCodes(codes: string[]): string {
  if (codes.includes("timeout-or-duplicate")) {
    return "Verificação expirada. Recarregue a página e tente novamente.";
  }
  if (codes.includes("invalid-input-response")) {
    return "Verificação anti-bot inválida. Recarregue a página.";
  }
  if (
    codes.includes("bad-request") ||
    codes.includes("invalid-input-secret")
  ) {
    return "Configuração anti-bot inválida no servidor. Contate o suporte.";
  }
  return "Verificação anti-bot falhou. Tente novamente.";
}
