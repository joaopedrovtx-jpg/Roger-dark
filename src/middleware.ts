import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "darkpay_session";

function sessionSecret(): string {
  const s =
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (s.length >= 16) return s;
  return "darkpay-dev-session-secret-min-16";
}

/** base64url → ArrayBuffer (Edge-safe) */
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
 * Valida formato + exp + HMAC (Web Crypto, Edge) do cookie assinado.
 * Cookie: base64url(rawToken|expUnix).sig
 * Legado (sem ponto): aceita presença; API valida no DB.
 */
async function cookieLooksValid(
  value: string | undefined
): Promise<boolean> {
  if (!value?.trim()) return false;
  const v = value.trim();

  if (!v.includes(".")) {
    // Legado opaco — exige tamanho mínimo (API valida no DB)
    return v.length >= 16;
  }

  const parts = v.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  if (!body || !sig || sig.length < 16) return false;

  try {
    const payload = new TextDecoder().decode(b64urlToBytes(body));
    const expStr = payload.split("|")[1];
    const exp = Number(expStr);
    if (!Number.isFinite(exp)) return false;
    if (exp * 1000 < Date.now()) return false;

    // HMAC-SHA256(body) base64url — mesmo algoritmo de signed-token.ts
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(sessionSecret()),
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

    // comparação tempo-constante simples
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

/**
 * Páginas logadas exigem cookie de sessão válido (formato/exp/HMAC).
 * /api/v1/* passa — handlers autenticam (session DB | API key).
 * Validação completa de existência no DB ocorre nos route handlers (Prisma).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE)?.value;

  if (pathname.startsWith("/api/v1/") || pathname.startsWith("/api/health")) {
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
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".svg");

  if (isPublic) {
    if (
      token &&
      (await cookieLooksValid(token)) &&
      (pathname.startsWith("/login") || pathname.startsWith("/registro"))
    ) {
      // Vai pra home; page `/` redireciona admin → /admin
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
