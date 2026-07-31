import { NextResponse } from "next/server";
import {
  getTurnstileSiteKey,
  isTurnstileServerEnabled,
} from "@/lib/server/turnstile";
import { securityHeaders } from "@/lib/server/security";

/**
 * Site key pública do Turnstile.
 * Permite ativar captcha em produção só com .env + restart (sem rebuild),
 * quando NEXT_PUBLIC_* não foi embutida no bundle client.
 *
 * Só expõe a key se secret + site key estiverem configurados (evita captcha cosmético).
 */
export async function GET() {
  const enabled = isTurnstileServerEnabled();
  const siteKey = enabled ? getTurnstileSiteKey() : null;

  return NextResponse.json(
    {
      enabled: Boolean(enabled && siteKey),
      siteKey: siteKey || null,
    },
    {
      headers: {
        ...securityHeaders(),
        "Cache-Control": "no-store",
      },
    }
  );
}
