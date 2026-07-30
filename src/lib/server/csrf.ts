/**
 * CSRF para mutações autenticadas por cookie de sessão.
 * SameSite=Lax + Origin/Host. Ativo por padrão (desliga só com CSRF_STRICT=0).
 */

import { env } from "@/lib/env";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

function parseHost(raw: string | null): string | null {
  if (!raw) return null;
  try {
    if (raw.includes("://")) return new URL(raw).host.toLowerCase();
    return raw.split("/")[0].toLowerCase();
  } catch {
    return null;
  }
}

function isStrict(): boolean {
  return env.CSRF_STRICT !== "0";
}

function normalizeHost(h: string): string {
  return h
    .replace("127.0.0.1", "localhost")
    .replace("::1", "localhost")
    .replace("[::1]", "localhost");
}

export function validateSessionCsrf(req: Request): string | null {
  const method = req.method.toUpperCase();
  if (SAFE.has(method)) return null;

  if (!isStrict()) return null;

  const host = parseHost(req.headers.get("host"));
  if (!host) {
    return "CSRF: Host ausente";
  }

  const origin = parseHost(req.headers.get("origin"));
  if (origin) {
    if (normalizeHost(origin) !== normalizeHost(host)) {
      return "CSRF: Origin não confere com Host";
    }
    return null;
  }

  const referer = parseHost(req.headers.get("referer"));
  if (referer) {
    if (normalizeHost(referer) !== normalizeHost(host)) {
      return "CSRF: Referer não confere com Host";
    }
    return null;
  }

  if (env.CSRF_ALLOW_MISSING_ORIGIN === "1") return null;
  return "CSRF: Origin/Referer ausente em mutação autenticada por sessão";
}

export function csrfFailResponse(message: string) {
  return Response.json(
    { error: message, code: "csrf_rejected" },
    { status: 403 }
  );
}
