import { NextResponse } from "next/server";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import {
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCodes,
  totpKeyUri,
  verifyTotp,
} from "@/lib/server/totp";

/** GET /api/v1/auth/2fa status + setup secret se não ativo */
export async function GET(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  if (!isDatabaseConfigured()) {
    return NextResponse.json({
      enabled: false,
      mode: "local",
      message: "Configure DATABASE_URL para 2FA persistente",
    });
  }

  let row = await prisma.user2FA.findUnique({
    where: { userId: gate.user.id },
  });
  if (!row) {
    row = await prisma.user2FA.create({
      data: { userId: gate.user.id, enabled: false },
    });
  }

  if (row.enabled) {
    return NextResponse.json({
      enabled: true,
      enabledAt: row.enabledAt,
    });
  }

  let secret = row.secret;
  if (!secret) {
    secret = generateTotpSecret();
    await prisma.user2FA.update({
      where: { userId: gate.user.id },
      data: { secret },
    });
  }

  return NextResponse.json({
    enabled: false,
    secret,
    otpauthUrl: totpKeyUri(gate.user.email, secret),
  });
}

/**
 * POST /api/v1/auth/2fa
 * { action: "enable", token } | { action: "disable", token }
 */
export async function POST(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "DATABASE_URL necessário para 2FA" },
      { status: 400 }
    );
  }

  const body = (await req.json()) as {
    action?: "enable" | "disable";
    token?: string;
  };
  const row = await prisma.user2FA.findUnique({
    where: { userId: gate.user.id },
  });
  if (!row?.secret) {
    return NextResponse.json(
      { error: "Inicie o setup com GET /api/v1/auth/2fa" },
      { status: 400 }
    );
  }

  if (!body.token || !verifyTotp(body.token, row.secret)) {
    return NextResponse.json({ error: "Código 2FA inválido" }, { status: 400 });
  }

  if (body.action === "enable") {
    const codes = generateBackupCodes();
    const hashed = await hashBackupCodes(codes);
    await prisma.user2FA.update({
      where: { userId: gate.user.id },
      data: {
        enabled: true,
        enabledAt: new Date(),
        backupCodes: hashed,
      },
    });
    // Devolve plaintext UMA vez depois só hashes no DB
    return NextResponse.json({
      enabled: true,
      backupCodes: codes,
      warning: "Guarde os backup codes. Eles não serão mostrados de novo.",
    });
  }

  if (body.action === "disable") {
    // Policy: admin não pode desligar 2FA se for obrigatório
    const { isAdmin2faRequired, rolesIncludeAdmin } = await import(
      "@/lib/server/admin-2fa-policy"
    );
    if (isAdmin2faRequired() && rolesIncludeAdmin(gate.user.roles)) {
      return NextResponse.json(
        {
          error:
            "Administradores não podem desativar o 2FA enquanto a policy REQUIRE_ADMIN_2FA estiver ativa.",
          code: "admin_2fa_required",
        },
        { status: 403 }
      );
    }

    await prisma.user2FA.update({
      where: { userId: gate.user.id },
      data: {
        enabled: false,
        enabledAt: null,
        secret: null,
        backupCodes: undefined,
      },
    });
    return NextResponse.json({ enabled: false });
  }

  return NextResponse.json({ error: "action inválida" }, { status: 400 });
}
