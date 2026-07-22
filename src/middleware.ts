import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "darkpay_session";

function sessionSecret(): string | null {
  const s =
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (s.length >= 16 && !/change-me|darkpay-dev-session-secret|example/i.test(s)) {
    return s;
  }
  // Sem secret forte: não aceita cookies assinados (fail-closed)
  return null;
}

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "===".slice((b64.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Valida formato + exp + HMAC. Rejeita cookie legado opaco (sem ponto).
 */
async function cookieLooksValid(
  value: string | undefined
): Promise<boolean> {
  if (!value?.trim()) return false;
  const v = value.trim();

  // Legado opaco: NUNCA aceitar
  if (!v.includes(".")) return false;

  const parts = v.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  if (!body || !sig || sig.length < 16) return false;

  const secret = sessionSecret();
  if (!secret) return false;

  try {
    const payload = new TextDecoder().decode(b64urlToBytes(body));
    const parts = payload.split("|");
    const expStr = parts[1];
    const status = parts[2] ?? "";
    const exp = Number(expStr);
    if (!Number.isFinite(exp)) return false;
    if (exp * 1000 < Date.now()) return false;
    if (status === "bloqueado") return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(body)
    );
    const expected = bytesToB64url(mac);

    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE)?.value;

  if (
    pathname === "/api/v1" ||
    pathname.startsWith("/api/v1/") ||
    pathname.startsWith("/api/health")
  ) {
    return NextResponse.next();
  }

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/registro") ||
    pathname.startsWith("/esqueci-senha") ||
    pathname.startsWith("/redefinir-senha") ||
    pathname.startsWith("/docs") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw-notifications.js" ||
    pathname === "/site.webmanifest" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".webmanifest") ||
    pathname.endsWith(".wav") ||
    pathname.endsWith(".mp3") ||
    pathname.startsWith("/sounds");

  if (isPublic) {
    if (
      token &&
      (await cookieLooksValid(token)) &&
      (pathname.startsWith("/login") || pathname.startsWith("/registro"))
    ) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!token || !(await cookieLooksValid(token))) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    const res = NextResponse.redirect(login);
    if (token) {
      res.cookies.delete(COOKIE);
    }
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
