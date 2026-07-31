/**
 * Config pública do Turnstile no browser.
 * 1) NEXT_PUBLIC_TURNSTILE_SITE_KEY embutida no build
 * 2) GET /api/v1/public/turnstile (runtime .env da VPS)
 */

export type TurnstilePublicConfig = {
  enabled: boolean;
  siteKey: string | null;
};

let cached: TurnstilePublicConfig | null = null;
let inflight: Promise<TurnstilePublicConfig> | null = null;

export function getBakedTurnstileSiteKey(): string {
  if (typeof process === "undefined") return "";
  return String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();
}

export async function fetchTurnstilePublicConfig(): Promise<TurnstilePublicConfig> {
  const baked = getBakedTurnstileSiteKey();
  if (baked.length >= 8) {
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
        enabled: Boolean(json.enabled && siteKey && siteKey.length >= 8),
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

/** Invalida cache (útil após troca de env em dev). */
export function clearTurnstilePublicConfigCache(): void {
  cached = null;
}
