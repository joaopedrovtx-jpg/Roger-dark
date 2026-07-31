/**
 * Config pública do Turnstile no browser.
 *
 * Prioridade:
 * 1) GET /api/v1/public/turnstile (runtime .env da VPS — fonte da verdade em prod)
 * 2) NEXT_PUBLIC_TURNSTILE_SITE_KEY embutida no build (só se NÃO for key dummy de teste)
 *
 * Keys oficiais de teste da CF (1x/2x/3x0000…) nunca são usadas no client.
 */

export type TurnstilePublicConfig = {
  enabled: boolean;
  siteKey: string | null;
};

let cached: TurnstilePublicConfig | null = null;
let inflight: Promise<TurnstilePublicConfig> | null = null;

/** Dummy keys da Cloudflare — exibem "Somente para teste". */
export function isTurnstileDummyKey(key: string): boolean {
  const k = key.trim();
  return (
    /^1x0{10,}/i.test(k) ||
    /^2x0{10,}/i.test(k) ||
    /^3x0{10,}/i.test(k) ||
    k.includes("00000000000000000000")
  );
}

export function getBakedTurnstileSiteKey(): string {
  if (typeof process === "undefined") return "";
  const baked = String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();
  if (!baked || isTurnstileDummyKey(baked)) return "";
  return baked;
}

export async function fetchTurnstilePublicConfig(): Promise<TurnstilePublicConfig> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    // Runtime first — permite trocar keys na VPS sem rebuild
    try {
      const res = await fetch("/api/v1/public/turnstile", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as {
          enabled?: boolean;
          siteKey?: string | null;
        };
        const siteKey = String(json.siteKey || "").trim() || null;
        if (
          json.enabled &&
          siteKey &&
          siteKey.length >= 8 &&
          !isTurnstileDummyKey(siteKey)
        ) {
          cached = { enabled: true, siteKey };
          return cached;
        }
        // enabled:false explícito no servidor
        if (json.enabled === false) {
          cached = { enabled: false, siteKey: null };
          return cached;
        }
      }
    } catch {
      /* cai no baked */
    }

    const baked = getBakedTurnstileSiteKey();
    if (baked.length >= 8) {
      cached = { enabled: true, siteKey: baked };
      return cached;
    }

    cached = { enabled: false, siteKey: null };
    return cached;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/** Invalida cache (útil após troca de env em dev). */
export function clearTurnstilePublicConfigCache(): void {
  cached = null;
}
