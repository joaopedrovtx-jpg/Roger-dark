/**
 * CSRF leve para mutações autenticadas por cookie de sessão.
 * SameSite=Lax já mitiga a maioria dos casos; Origin/Host fecha o resto.
 *
 * - API key (Bearer sk_*) → isento
 * - GET/HEAD/OPTIONS → isento
 * - Webhooks públicos → não usam este helper
 */

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

function parseHost(raw: string | null): string | null {
  if (!raw) return null;
  try {
    // aceita host:port ou URL completa
    if (raw.includes("://")) return new URL(raw).host.toLowerCase();
    return raw.split("/")[0].toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Valida Origin (ou Referer) contra Host da requisição.
 * Retorna null se ok, ou mensagem de erro.
 */
export function validateSessionCsrf(req: Request): string | null {
  const method = req.method.toUpperCase();
  if (SAFE.has(method)) return null;

  // Só aplica a quem autenticaria via cookie (sem sk_ no Authorization)
  const auth =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (auth.toLowerCase().startsWith("bearer sk_")) return null;

  // Em dev local, permitir se CSRF_STRICT não estiver ligado
  const strict =
    process.env.CSRF_STRICT === "1" || process.env.NODE_ENV === "production";
  if (!strict) return null;

  const host = parseHost(req.headers.get("host") || req.headers.get("x-forwarded-host"));
  if (!host) return null; // sem host não dá pra validar

  const origin = parseHost(req.headers.get("origin"));
  if (origin) {
    if (origin !== host) {
      // permite localhost ↔ 127.0.0.1 em dev
      const o = origin.replace("127.0.0.1", "localhost");
      const h = host.replace("127.0.0.1", "localhost");
      if (o !== h) return "CSRF: Origin não confere com Host";
    }
    return null;
  }

  // Sem Origin (alguns clientes): checa Referer
  const referer = parseHost(req.headers.get("referer"));
  if (referer) {
    const r = referer.replace("127.0.0.1", "localhost");
    const h = host.replace("127.0.0.1", "localhost");
    if (r !== h) return "CSRF: Referer não confere com Host";
    return null;
  }

  // Fetch same-site geralmente manda Origin. Se nenhum veio em produção, rejeita.
  if (process.env.CSRF_ALLOW_MISSING_ORIGIN === "1") return null;
  return "CSRF: Origin/Referer ausente em mutação autenticada por sessão";
}

export function csrfFailResponse(message: string) {
  return Response.json(
    { error: message, code: "csrf_rejected" },
    { status: 403 }
  );
}
