/**
 * Password reset real: gera token, envia e-mail, valida, troca senha e invalida sessoes.
 */
import { randomBytes, createHash } from "crypto";

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { sendPasswordResetEmail } from "@/lib/server/email";
import { hashPassword } from "@/lib/server/auth";
import { validatePasswordStrength } from "@/lib/server/security";
import { log } from "@/lib/server/logger";

const TOKEN_TTL_MIN = 30;
const RESET_COOLDOWN_MS = 60_000;
const resetRateMap = new Map<string, number>();

function newId(prefix: string) {
  return `${prefix}_${randomBytes(18).toString("base64url")}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isEmailShaped(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function publicAppUrl(): string {
  return (
    process.env.APP_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

/**
 * Inicia fluxo de reset. SEMPRE retorna ok (anti-enumeração), mesmo se e-mail nao existir.
 * Em prod: bloqueia e-mails de seed (`*@darkpay.app`) — eles nao devem usar este fluxo.
 */
export async function requestPasswordReset(
  emailRaw: string,
  meta?: { ip?: string; userAgent?: string }
): Promise<{ ok: true }> {
  const email = emailRaw.trim().toLowerCase();
  if (!isEmailShaped(email)) {
    return { ok: true };
  }

  // Hardening: nunca permitir reset via fluxo "publico" para contas de seed.
  // Dono de seed troca direto no DB / env.
  if (/@darkpay\.app$/i.test(email) && process.env.NODE_ENV === "production") {
    log.warn(
      { event: "auth_password_reset_blocked_seed", email },
      "auth_password_reset_blocked_seed"
    );
    return { ok: true };
  }

  if (!isDatabaseConfigured()) {
    log.warn(
      { event: "auth_password_reset_no_db" },
      "auth_password_reset_no_db"
    );
    return { ok: true };
  }

  const lastReq = resetRateMap.get(email);
  if (lastReq && Date.now() - lastReq < RESET_COOLDOWN_MS) {
    return { ok: true };
  }
  resetRateMap.set(email, Date.now());
  // Evita crecimiento infinito do map
  if (resetRateMap.size > 10_000) {
    const now = Date.now();
    for (const [k, ts] of resetRateMap) {
      if (now - ts > RESET_COOLDOWN_MS * 2) resetRateMap.delete(k);
    }
  }

  const user = await prisma.user.findUnique({ where: { email } }).catch(() => null);
  if (!user) {
    // Anti-enumeração: mesma latência + mesmo retorno
    await new Promise((r) => setTimeout(r, 50));
    log.info(
      { event: "auth_password_reset_requested_unknown_email" },
      "auth_password_reset_requested_unknown_email"
    );
    return { ok: true };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60_000);

  // Invalida resets anteriores nao usados
  await prisma.passwordReset
    .updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })
    .catch(() => null);

  await prisma.passwordReset.create({
    data: {
      id: newId("prt"),
      userId: user.id,
      email,
      token: tokenHash,
      expiresAt,
    },
  });

  const link = `${publicAppUrl()}/redefinir-senha?token=${encodeURIComponent(
    token
  )}&email=${encodeURIComponent(email)}`;

  await sendPasswordResetEmail(email, user.name || "cliente", link, TOKEN_TTL_MIN);

  log.info(
    {
      event: "auth_password_reset_requested",
      userId: user.id,
      email,
      ip: meta?.ip,
    },
    "auth_password_reset_requested"
  );

  return { ok: true };
}

export type ResetResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid_token" | "expired_token" | "used_token" | "weak_password" | "no_db" };

/**
 * Consome token + nova senha. Atômico: marca usado, troca hash, invalida todas as sessoes.
 */
export async function consumePasswordReset(
  emailRaw: string,
  tokenRaw: string,
  newPassword: string,
  meta?: { ip?: string; userAgent?: string }
): Promise<ResetResult> {
  const email = emailRaw.trim().toLowerCase();
  const token = tokenRaw.trim();
  if (!isEmailShaped(email) || !token) {
    return { ok: false, reason: "invalid_token" };
  }

  if (!isDatabaseConfigured()) {
    return { ok: false, reason: "no_db" };
  }

  const pwdErr = validatePasswordStrength(newPassword);
  if (pwdErr) return { ok: false, reason: "weak_password" };

  const tokenHash = hashToken(token);
  const rec = await prisma.passwordReset.findUnique({
    where: { token: tokenHash },
  });
  if (!rec) return { ok: false, reason: "invalid_token" };
  if (rec.email !== email) return { ok: false, reason: "invalid_token" };
  if (rec.usedAt) return { ok: false, reason: "used_token" };
  if (rec.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired_token" };

  const newHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    // Marca reset usado
    await tx.passwordReset.updateMany({
      where: { id: rec.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    // Troca senha
    await tx.user.update({
      where: { id: rec.userId },
      data: { passwordHash: newHash },
    });
    // Invalida TODAS as sessoes existentes
    await tx.session.deleteMany({
      where: { userId: rec.userId },
    });
  });

  // Limpa resets antigos em background (best-effort)
  prisma.passwordReset
    .deleteMany({
      where: {
        userId: rec.userId,
        OR: [
          { usedAt: { not: null } },
          { expiresAt: { lt: new Date() } },
        ],
      },
    })
    .catch(() => null);

  log.info(
    {
      event: "auth_password_reset_succeeded",
      userId: rec.userId,
      email,
      ip: meta?.ip,
    },
    "auth_password_reset_succeeded"
  );

  return { ok: true, userId: rec.userId };
}

/** Re-export para testes / cross-check. */
export const _internal = { hashToken };
