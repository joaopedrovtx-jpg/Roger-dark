/**
 * Verificação server-side do Cloudflare Turnstile (CAPTCHA humano).
 *
 * Fluxo:
 * 1. Cliente renderiza widget com a NEXT_PUBLIC_TURNSTILE_SITE_KEY → gera token.
 * 2. Servidor valida token via POST https://challenges.cloudflare.com/turnstile/v0/siteverify
 *    enviando TURNSTILE_SECRET_KEY + IP do cliente (rate-limit + contexto).
 *
 * Se siteVerify falhar, o request é rejeitado (fail-closed). Em dev sem
 * secret configurado, pula verificação (mantém fluxo local).
 *
 * Nota: NÃO passamos `idempotency_key` — cada novo submit gera um token
 * novo no widget (cf-turnstile-response), e a Cloudflare já invalida
 * tokens consumidos. Chaves estáveis (ex.: "login:<ip>") causariam
 * conflito entre tentativas legítimas do mesmo IP.
 */

import { env } from "@/lib/env";
import { getClientIp } from "@/lib/server/security";
import { log } from "@/lib/server/logger";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** true quando a verificação server-side deve rodar (prod/dev com secret). */
export function isTurnstileServerEnabled(): boolean {
  return !!env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SECRET_KEY.length >= 8;
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
  action?: string;
  cdata?: string;
  hostname?: string;
  challengeTs?: string;
}

/**
 * Verifica token Turnstile. Em caso de falha de rede da Cloudflare,
 * retorna ok=false (fail-closed) — nunca relaxa segurança.
 *
 * @param token Token retornado pelo widget do client (cf-turnstile-response).
 * @param req Requisição HTTP (extrai IP p/ contexto da Cloudflare).
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  req?: Request
): Promise<VerifyResult> {
  if (!isTurnstileServerEnabled()) {
    // Sem secret: não bloqueia o fluxo (dev/local sem captcha configurado).
    return { ok: true };
  }
  if (!token || typeof token !== "string" || token.length < 10) {
    return { ok: false, error: "Verificação anti-bot ausente. Recarregue a página." };
  }

  const ip = req ? getClientIp(req) : undefined;
  const formData = new URLSearchParams();
  formData.append("secret", env.TURNSTILE_SECRET_KEY);
  formData.append("response", token);
  if (ip) formData.append("remoteip", ip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      log.warn(
        { status: res.status },
        "turnstile_siteverify_http_failed"
      );
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

    if (json.success) {
      return {
        ok: true,
        action: json.action,
        cdata: json.cdata,
        hostname: json.hostname,
        challengeTs: json.challenge_ts,
      };
    }

    const codes = json["error-codes"] ?? [];
    log.warn({ codes }, "turnstile_verification_failed");
    return {
      ok: false,
      error: humanizeErrorCodes(codes),
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
  if (codes.includes("bad-request") || codes.includes("invalid-input-secret")) {
    return "Configuração anti-bot inválida no servidor. Contate o suporte.";
  }
  return "Verificação anti-bot falhou. Tente novamente.";
}