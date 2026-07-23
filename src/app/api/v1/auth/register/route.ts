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

    const body = (await req.json()) as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
    };

    if (!body.name?.trim() || !body.email?.trim() || !body.password) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são obrigatórios." },
        { status: 400, headers: securityHeaders() }
      );
    }

    const name = sanitizeDisplayName(body.name);
    if (name.length < 2) {
      return NextResponse.json(
        { error: "Nome inválido." },
        { status: 400, headers: securityHeaders() }
      );
    }

    const email = body.email.trim().toLowerCase();
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
        phone: body.phone ?? "",
        password: body.password,
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
