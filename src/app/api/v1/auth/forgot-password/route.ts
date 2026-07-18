import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/server/password-reset";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  securityHeaders,
} from "@/lib/server/security";

/** POST /api/v1/auth/forgot-password — { email } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = body.email?.trim() || "";
    if (!email) {
      return NextResponse.json(
        { error: "Informe o e-mail da sua conta." },
        { status: 400, headers: securityHeaders() }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rateKey = `forgot:${ip}:${email.toLowerCase()}`;
    const rate = checkLoginRateLimit(rateKey);
    if (!rate.ok) {
      return NextResponse.json(
        {
          error: "Muitas tentativas. Aguarde alguns minutos.",
          retryAfterSec: rate.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            ...securityHeaders(),
            ...(rate.retryAfterSec
              ? { "Retry-After": String(rate.retryAfterSec) }
              : {}),
          },
        }
      );
    }

    const result = await requestPasswordReset(email);
    clearLoginRateLimit(rateKey);

    return NextResponse.json(
      {
        ok: true,
        message: result.message,
        ...(result.debugCode ? { debugCode: result.debugCode } : {}),
        ...(result.mode ? { emailMode: result.mode } : {}),
      },
      { headers: securityHeaders() }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao solicitar redefinição";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: securityHeaders() }
    );
  }
}
