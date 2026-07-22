/**
 * Turnstile no cliente.
 * Preferência:
 * 1) NEXT_PUBLIC_TURNSTILE_SITE_KEY embutida no build
 * 2) GET /api/v1/public/turnstile (runtime, .env da VPS)
 */

let cached: { enabled: boolean; siteKey: string | null } | null = null;
let inflight: Promise<{ enabled: boolean; siteKey: string | null }> | null =
  null;

export function isTurnstileClientEnabled(): boolean {
  const key =
    typeof process !== "undefined"
      ? String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim()
      : "";
  if (key.length > 0) return true;
  // sem chave no build: o widget busca runtime; assume possível até provar o contrário
  return cached?.enabled === true;
}

export async function fetchTurnstilePublicConfig(): Promise<{
  enabled: boolean;
  siteKey: string | null;
}> {
  const baked =
    typeof process !== "undefined"
      ? String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim()
      : "";
  if (baked) {
    cached = { enabled: true, siteKey: baked };
    return cached;
  }

  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/v1/public/turnstile", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        cached = { enabled: false, siteKey: null };
        return cached;
      }
      const json = (await res.json()) as {
        enabled?: boolean;
        siteKey?: string | null;
      };
      const siteKey = String(json.siteKey || "").trim() || null;
      cached = {
        enabled: Boolean(json.enabled && siteKey),
        siteKey,
      };
      return cached;
    } catch {
      cached = { enabled: false, siteKey: null };
      return cached;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
