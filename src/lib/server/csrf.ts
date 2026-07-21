/**
 * CSRF para mutações autenticadas por cookie de sessão.
 * SameSite=Lax + Origin/Host. Ativo por padrão (desliga só com CSRF_STRICT=0).
 */

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
  if (process.env.CSRF_STRICT === "0") return false;
  if (process.env.CSRF_STRICT === "1") return true;
  // default: sempre strict
  return true;
}

/**
 * Valida Origin (ou Referer) contra Host.
 * Retorna null se ok, ou mensagem de erro.
 */
export function validateSessionCsrf(req: Request): string | null {
  const method = req.method.toUpperCase();
  if (SAFE.has(method)) return null;

  if (!isStrict()) return null;

  const host = parseHost(
    req.headers.get("host") || req.headers.get("x-forwarded-host")
  );
  if (!host) {
    return "CSRF: Host ausente";
  }

  const origin = parseHost(req.headers.get("origin"));
  if (origin) {
    if (origin !== host) {
      const o = origin.replace("127.0.0.1", "localhost");
      const h = host.replace("127.0.0.1", "localhost");
      if (o !== h) return "CSRF: Origin não confere com Host";
    }
    return null;
  }

  const referer = parseHost(req.headers.get("referer"));
  if (referer) {
    const r = referer.replace("127.0.0.1", "localhost");
    const h = host.replace("127.0.0.1", "localhost");
    if (r !== h) return "CSRF: Referer não confere com Host";
    return null;
  }

  if (process.env.CSRF_ALLOW_MISSING_ORIGIN === "1") return null;
  return "CSRF: Origin/Referer ausente em mutação autenticada por sessão";
}

export function csrfFailResponse(message: string) {
  return Response.json(
    { error: message, code: "csrf_rejected" },
    { status: 403 }
  );
}
