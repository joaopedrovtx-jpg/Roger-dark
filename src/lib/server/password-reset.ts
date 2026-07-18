/**
 * Redefinição de senha: gera código, grava no DB e envia e-mail.
 */

import { randomBytes, randomInt } from "crypto";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { hashPassword } from "@/lib/server/auth";
import { sendPasswordResetEmail } from "@/lib/server/email";
import { validatePasswordStrength } from "@/lib/server/security";

const TTL_MS = 60 * 60 * 1000; // 1h

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function newId() {
  return `pwr_${randomBytes(12).toString("base64url")}`;
}

/** Código numérico de 6 dígitos (fácil de digitar). */
function generateResetCode(): string {
  return String(randomInt(100000, 999999));
}

/**
 * Solicita redefinição. Sempre responde ok (não vaza se o e-mail existe).
 * Em dev sem RESEND_API_KEY o e-mail vai para o console do servidor.
 */
export async function requestPasswordReset(emailRaw: string): Promise<{
  ok: true;
  message: string;
  /** só em dev/log — nunca em produção com Resend */
  debugCode?: string;
  mode?: "resend" | "log";
}> {
  if (!isDatabaseConfigured()) {
    throw new Error("Banco indisponível. Configure DATABASE_URL.");
  }

  const email = emailRaw.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new Error("Informe um e-mail válido.");
  }

  const generic = {
    ok: true as const,
    message:
      "Se este e-mail estiver cadastrado, enviamos um código para redefinir a senha.",
  };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    // Não revela existência da conta
    return generic;
  }

  // Invalida resets anteriores não usados
  await prisma.passwordReset.deleteMany({
    where: { userId: user.id, usedAt: null },
  });

  const code = generateResetCode();
  const expiresAt = new Date(Date.now() + TTL_MS);

  await prisma.passwordReset.create({
    data: {
      id: newId(),
      userId: user.id,
      email,
      token: code,
      expiresAt,
    },
  });

  const link = `${appBaseUrl()}/redefinir-senha?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`;

  const sent = await sendPasswordResetEmail(email, {
    code,
    link,
    name: user.name,
  });

  if (!sent.ok) {
    throw new Error(
      "Não foi possível enviar o e-mail. Tente de novo em alguns minutos."
    );
  }

  const isProd = process.env.NODE_ENV === "production";
  return {
    ...generic,
    mode: sent.mode,
    // Em log/dev facilita testar sem caixa de e-mail
    ...(!isProd && sent.mode === "log" ? { debugCode: code } : {}),
  };
}

/**
 * Aplica nova senha com e-mail + código.
 */
export async function completePasswordReset(input: {
  email: string;
  code: string;
  password: string;
}): Promise<{ ok: true }> {
  if (!isDatabaseConfigured()) {
    throw new Error("Banco indisponível. Configure DATABASE_URL.");
  }

  const email = input.email.trim().toLowerCase();
  const code = input.code.trim().replace(/\s/g, "");
  if (!email || !code) {
    throw new Error("E-mail e código são obrigatórios.");
  }

  const pwdErr = validatePasswordStrength(input.password);
  if (pwdErr) throw new Error(pwdErr);

  const row = await prisma.passwordReset.findFirst({
    where: {
      email,
      token: code,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!row) {
    throw new Error(
      "Código inválido ou expirado. Solicite um novo em Esqueci a senha."
    );
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    }),
    prisma.passwordReset.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    // Encerra sessões antigas (força novo login)
    prisma.session.deleteMany({ where: { userId: row.userId } }),
  ]);

  return { ok: true };
}
