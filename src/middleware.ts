import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "darkpay_session";

/**
 * Páginas logadas exigem cookie de sessão.
 * /api/v1/* passa sempre — handlers autenticam com sessão OU API key (sk_live_/sk_test_).
 * Assim cassino/checkout externo integra sem cookie do painel.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE)?.value;

  // API do gateway: auth no route handler (session cookie | Bearer sk_…)
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
      (pathname.startsWith("/login") || pathname.startsWith("/registro"))
    ) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // Páginas privadas (dashboard seller/admin)
  if (!token) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Protege tudo exceto assets estáticos óbvios.
     * Públicas tratadas no handler.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
