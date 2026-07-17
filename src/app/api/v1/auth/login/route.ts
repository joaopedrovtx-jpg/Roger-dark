import { NextResponse } from "next/server";
import {
  loginWithPassword,
  createSessionForUser,
  sessionCookieOptions,
  assertDatabase,
  verifyPassword,
} from "@/lib/server/auth";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  securityHeaders,
} from "@/lib/server/security";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { create2faChallenge } from "@/lib/server/signed-token";

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
        { status: 400, headers: securityHeaders() }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rateKey = `${ip}:${body.email.trim().toLowerCase()}`;
    const rate = checkLoginRateLimit(rateKey);
    if (!rate.ok) {
      return NextResponse.json(
        {
          error: "Muitas tentativas de login. Tente novamente em alguns minutos.",
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

    // Se 2FA ativo: valida senha e devolve challenge (sem cookie ainda)
    if (isDatabaseConfigured()) {
      await assertDatabase();
      const email = body.email.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) {
        return NextResponse.json(
          { error: "E-mail ou senha inválidos." },
          { status: 401, headers: securityHeaders() }
        );
      }
      const ok = await verifyPassword(body.password, user.passwordHash);
      if (!ok) {
        return NextResponse.json(
          { error: "E-mail ou senha inválidos." },
          { status: 401, headers: securityHeaders() }
        );
      }
      if (user.status === "bloqueado") {
        return NextResponse.json(
          { error: "Conta bloqueada. Fale com o suporte." },
          { status: 403, headers: securityHeaders() }
        );
      }

      const twoFa = await prisma.user2FA.findUnique({
        where: { userId: user.id },
      });
      if (twoFa?.enabled) {
        clearLoginRateLimit(rateKey);
        const challenge = create2faChallenge(user.id);
        return NextResponse.json(
          {
            requires2fa: true,
            challenge,
            message: "Informe o código do autenticador (ou backup code).",
          },
          { headers: securityHeaders() }
        );
      }

      // Sem 2FA: cria sessão
      const { session, token } = await createSessionForUser(user.id, {
        ip,
        userAgent: req.headers.get("user-agent") ?? undefined,
      });
      clearLoginRateLimit(rateKey);
      const res = NextResponse.json(
        { user: session.user, expiresAt: session.expiresAt },
        { headers: securityHeaders() }
      );
      const cookie = sessionCookieOptions(token, req);
      res.cookies.set(cookie.name, cookie.value, {
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        path: cookie.path,
        secure: cookie.secure,
        maxAge: cookie.maxAge,
      });
      return res;
    }

    // Fallback legado
    const session = await loginWithPassword(
      { email: body.email, password: body.password },
      { ip, userAgent: req.headers.get("user-agent") ?? undefined }
    );
    clearLoginRateLimit(rateKey);
    const res = NextResponse.json(
      { user: session.user, expiresAt: session.expiresAt },
      { headers: securityHeaders() }
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
    const msg = e instanceof Error ? e.message : "Falha no login";
    return NextResponse.json(
      { error: msg },
      { status: 401, headers: securityHeaders() }
    );
  }
}
