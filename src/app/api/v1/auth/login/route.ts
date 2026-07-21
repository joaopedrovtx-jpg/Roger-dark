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
  getClientIp,
  securityHeaders,
} from "@/lib/server/security";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { create2faChallenge } from "@/lib/server/signed-token";
import { loginSchema, formatZodError } from "@/lib/api/schemas";
import { checkSeedLogin } from "@/lib/server/seed-block";
import { z } from "zod";
import { log } from "@/lib/server/logger";

export async function POST(req: Request) {
  try {
    let body: z.infer<typeof loginSchema>;
    try {
      body = loginSchema.parse(await req.json());
    } catch (e) {
      const msg = e instanceof z.ZodError ? formatZodError(e) : "Requisição inválida";
      return NextResponse.json(
        { error: msg },
        { status: 400, headers: securityHeaders() }
      );
    }

    const ip = getClientIp(req);
    const email = body.email.trim().toLowerCase();

    // Hardening: bloqueia contas de seed em produção (DP-V3-02)
    const seedCheck = checkSeedLogin(email);
    if (!seedCheck.allowed) {
      return NextResponse.json(
        { error: seedCheck.reason },
        { status: 403, headers: securityHeaders() }
      );
    }

    const rate = await checkLoginRateLimit({ ip, email });
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

    if (isDatabaseConfigured()) {
      await assertDatabase();
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) {
        log.warn({ event: "auth_login_failed_no_account", email, ip }, "login_failed");
        return NextResponse.json(
          { error: "E-mail ou senha inválidos." },
          { status: 401, headers: securityHeaders() }
        );
      }
      const ok = await verifyPassword(body.password, user.passwordHash);
      if (!ok) {
        log.warn({ event: "auth_login_failed_wrong_password", email, ip, userId: user.id }, "login_failed");
        return NextResponse.json(
          { error: "E-mail ou senha inválidos." },
          { status: 401, headers: securityHeaders() }
        );
      }
      if (user.status === "bloqueado") {
        log.warn({ event: "auth_login_blocked", email, ip, userId: user.id }, "login_blocked");
        return NextResponse.json(
          { error: "Conta bloqueada. Fale com o suporte." },
          { status: 403, headers: securityHeaders() }
        );
      }

      const twoFa = await prisma.user2FA.findUnique({
        where: { userId: user.id },
      });
      if (twoFa?.enabled) {
        await clearLoginRateLimit({ ip, email });
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

      const { session, token } = await createSessionForUser(user.id, {
        ip,
        userAgent: req.headers.get("user-agent") ?? undefined,
      });
      await clearLoginRateLimit({ ip, email });
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

    const session = await loginWithPassword(
      { email: body.email, password: body.password },
      { ip, userAgent: req.headers.get("user-agent") ?? undefined }
    );
    await clearLoginRateLimit({ ip, email });
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
