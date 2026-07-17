import { NextResponse } from "next/server";
import {
  createSessionForUser,
  sessionCookieOptions,
  assertDatabase,
} from "@/lib/server/auth";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { verify2faChallenge } from "@/lib/server/signed-token";
import { verifyTotp, consumeBackupCode } from "@/lib/server/totp";
import { securityHeaders } from "@/lib/server/security";

/**
 * POST /api/v1/auth/login/2fa
 * Completa login após senha: { challenge, token } (TOTP ou backup code)
 */
export async function POST(req: Request) {
  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        { error: "Banco indisponível" },
        { status: 503, headers: securityHeaders() }
      );
    }
    await assertDatabase();

    const body = (await req.json()) as {
      challenge?: string;
      token?: string;
    };
    if (!body.challenge?.trim() || !body.token?.trim()) {
      return NextResponse.json(
        { error: "challenge e token são obrigatórios" },
        { status: 400, headers: securityHeaders() }
      );
    }

    const ch = verify2faChallenge(body.challenge.trim());
    if (!ch.ok) {
      return NextResponse.json(
        {
          error:
            ch.reason === "expired"
              ? "Desafio 2FA expirado. Faça login de novo."
              : "Desafio 2FA inválido.",
        },
        { status: 401, headers: securityHeaders() }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: ch.userId } });
    if (!user || user.status === "bloqueado") {
      return NextResponse.json(
        { error: "Conta indisponível" },
        { status: 403, headers: securityHeaders() }
      );
    }

    const twoFa = await prisma.user2FA.findUnique({
      where: { userId: user.id },
    });
    if (!twoFa?.enabled || !twoFa.secret) {
      return NextResponse.json(
        { error: "2FA não está ativo nesta conta" },
        { status: 400, headers: securityHeaders() }
      );
    }

    const code = body.token.trim();
    let ok = verifyTotp(code, twoFa.secret);
    if (!ok) {
      // tenta backup code (hasheado)
      const remaining = await consumeBackupCode(code, twoFa.backupCodes);
      if (remaining) {
        ok = true;
        await prisma.user2FA.update({
          where: { userId: user.id },
          data: { backupCodes: remaining },
        });
      }
    }

    if (!ok) {
      return NextResponse.json(
        { error: "Código 2FA inválido" },
        { status: 401, headers: securityHeaders() }
      );
    }

    const { session, token } = await createSessionForUser(user.id, {
      ip: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no 2FA";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: securityHeaders() }
    );
  }
}
