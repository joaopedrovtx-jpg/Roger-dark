import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logoutByToken, SESSION_COOKIE_NAME } from "@/lib/server/auth";

/** POST /api/v1/auth/logout */
export async function POST() {
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE_NAME)?.value;
    await logoutByToken(token);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    return res;
  }
}
