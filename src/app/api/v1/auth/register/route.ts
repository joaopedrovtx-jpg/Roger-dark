import { NextResponse } from "next/server";
import {
  registerWithPassword,
  sessionCookieOptions,
} from "@/lib/server/auth";

/** POST /api/v1/auth/register */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
    };
    if (!body.name?.trim() || !body.email?.trim() || !body.password) {
      return NextResponse.json(
        { error: "Nome, e-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    const session = await registerWithPassword(
      {
        name: body.name,
        email: body.email,
        phone: body.phone ?? "",
        password: body.password,
      },
      {
        ip: req.headers.get("x-forwarded-for") ?? undefined,
        userAgent: req.headers.get("user-agent") ?? undefined,
      }
    );

    // Cookie only — sem token no body
    const res = NextResponse.json(
      { user: session.user, expiresAt: session.expiresAt },
      { status: 201 }
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
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
