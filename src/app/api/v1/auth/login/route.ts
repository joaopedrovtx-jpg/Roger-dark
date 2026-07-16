import { NextResponse } from "next/server";
import {
  loginWithPassword,
  sessionCookieOptions,
} from "@/lib/server/auth";

/** POST /api/v1/auth/login */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
    };
    if (!body.email?.trim() || !body.password) {
      return NextResponse.json(
        { error: "E-mail e senha são obrigatórios." },
        { status: 400 }
      );
    }

    const session = await loginWithPassword(
      { email: body.email, password: body.password },
      {
        ip: req.headers.get("x-forwarded-for") ?? undefined,
        userAgent: req.headers.get("user-agent") ?? undefined,
      }
    );

    const res = NextResponse.json(session);
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
    const msg = e instanceof Error ? e.message : "Falha no login";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
