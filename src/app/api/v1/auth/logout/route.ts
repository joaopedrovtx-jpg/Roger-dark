import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logoutByToken, SESSION_COOKIE_NAME } from "@/lib/server/auth";
import { securityHeaders } from "@/lib/server/security";

/** POST /api/v1/auth/logout */
export async function POST() {
  const isHttps =
    process.env.COOKIE_SECURE === "1" || !!process.env.VERCEL;
  const clearCookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttps,
    path: "/",
    maxAge: 0,
  };
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE_NAME)?.value;
    await logoutByToken(token);
    const res = NextResponse.json({ ok: true }, { headers: securityHeaders() });
    res.cookies.set(SESSION_COOKIE_NAME, "", clearCookie);
    return res;
  } catch {
    const res = NextResponse.json({ ok: true }, { headers: securityHeaders() });
    res.cookies.set(SESSION_COOKIE_NAME, "", clearCookie);
    return res;
  }
}
