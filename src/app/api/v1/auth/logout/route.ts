import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logoutByToken, SESSION_COOKIE_NAME } from "@/lib/server/auth";
import { securityHeaders } from "@/lib/server/security";

/** Espelha flags do cookie de sessão para o browser aceitar o clear. */
function clearSessionCookie(res: NextResponse) {
  const isHttps =
    process.env.NODE_ENV === "production" ||
    process.env.COOKIE_SECURE === "1" ||
    process.env.COOKIE_SECURE === "true" ||
    !!process.env.VERCEL;
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isHttps,
    maxAge: 0,
  });
}

/** POST /api/v1/auth/logout */
export async function POST() {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE_NAME)?.value;
    await logoutByToken(token);
    const res = NextResponse.json({ ok: true }, { headers: securityHeaders() });
    clearSessionCookie(res);
    return res;
  } catch {
    const res = NextResponse.json({ ok: true }, { headers: securityHeaders() });
    clearSessionCookie(res);
    return res;
  }
}
