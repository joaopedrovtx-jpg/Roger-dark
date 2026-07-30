import { NextResponse } from "next/server";
import {
  registerWithPassword,
  sessionCookieOptions,
} from "@/lib/server/auth";
import {
  checkRegisterRateLimit,
  getClientIp,
  sanitizeDisplayName,
  securityHeaders,
  isProduction,
} from "@/lib/server/security";
import { registerSchema, formatZodError } from "@/lib/api/schemas";

/** POST /api/v1/auth/register */
export async function POST(req: Request) {
  try {
    if (
      isProduction() &&
      process.env.ALLOW_PUBLIC_REGISTER === "0"
    ) {
      return NextResponse.json(
        { error: "Registro público desabilitado." },
        { status: 403, headers: securityHeaders() }
      );
    }

    const ip = getClientIp(req);
    const rate = await checkRegisterRateLimit(ip);
    if (!rate.ok) {
      return NextResponse.json(
        {
          error: "Muitos cadastros deste IP. Tente mais tarde.",
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

    const raw = await req.json();
    const parsed = registerSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400, headers: securityHeaders() }
      );
    }

    const name = sanitizeDisplayName(parsed.data.name);
    if (name.length < 2) {
      return NextResponse.json(
        { error: "Nome inválido." },
        { status: 400, headers: securityHeaders() }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    if (
      isProduction() &&
      (email.endsWith("@darkpay.app") || email.endsWith("@example.com"))
    ) {
      return NextResponse.json(
        { error: "E-mail não permitido." },
        { status: 400, headers: securityHeaders() }
      );
    }

    const session = await registerWithPassword(
      {
        name,
        email,
        phone: parsed.data.phone ?? "",
        password: parsed.data.password,
      },
      {
        ip,
        userAgent: req.headers.get("user-agent") ?? undefined,
      }
    );

    const res = NextResponse.json(
      { user: session.user, expiresAt: session.expiresAt },
      { status: 201, headers: securityHeaders() }
    );
    const cookie = sessionCookieOptions(session.token, req);
    res.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      path: cookie.path,
      secure: cookie.secure,
      maxAge: cookie.maxAge,
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no cadastro";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: securityHeaders() }
    );
  }
}
