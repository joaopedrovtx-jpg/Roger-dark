import { NextResponse } from "next/server";
import { securityHeaders } from "@/lib/server/security";

/**
 * Site key pública do Turnstile (não é secret).
 * Permite ligar o captcha em produção sem rebuild se NEXT_PUBLIC_*
 * não foi embutida no build — usa o valor do .env em runtime.
 */
export async function GET() {
  const siteKey = (
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
    process.env.TURNSTILE_SITE_KEY ||
    ""
  ).trim();

  const enabled = siteKey.length > 0;

  return NextResponse.json(
    {
      enabled,
      siteKey: enabled ? siteKey : null,
    },
    {
      headers: {
        ...securityHeaders(),
        // chave pública; evita cache stale após rotacionar no .env
        "Cache-Control": "no-store",
      },
    }
  );
}
