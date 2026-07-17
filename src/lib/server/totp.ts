/**
 * 2FA TOTP real (RFC 6238) via otplib v13+ + backup codes hasheados.
 */
import {
  generateSecret as otpGenerateSecret,
  generateURI,
  verifySync,
} from "otplib";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";

export function generateTotpSecret(): string {
  return otpGenerateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return generateURI({
    issuer: "DarkPay",
    label: email,
    secret,
  });
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    const result = verifySync({
      token: token.replace(/\s/g, ""),
      secret,
    });
    if (typeof result === "boolean") return result;
    if (result && typeof result === "object" && "valid" in result) {
      return !!(result as { valid: boolean }).valid;
    }
    return false;
  } catch {
    return false;
  }
}

/** Códigos de backup em texto claro (mostrar uma vez ao usuário). */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 8 chars alfanum seguros (não Math.random fraco)
    codes.push(randomBytes(5).toString("hex").slice(0, 8).toUpperCase());
  }
  return codes;
}

/** Hash de um código de backup (bcrypt). */
export async function hashBackupCode(code: string): Promise<string> {
  return bcrypt.hash(normalizeBackupCode(code), 10);
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => hashBackupCode(c)));
}

function normalizeBackupCode(code: string): string {
  return code.replace(/\s/g, "").toUpperCase();
}

/**
 * Consome um backup code: retorna lista de hashes restantes se válido, null se inválido.
 * Aceita hashes bcrypt (novos) ou legado plaintext (migração).
 */
export async function consumeBackupCode(
  code: string,
  stored: unknown
): Promise<string[] | null> {
  if (!Array.isArray(stored) || !stored.length) return null;
  const needle = normalizeBackupCode(code);
  const hashes = stored.map((c) => String(c));

  for (let i = 0; i < hashes.length; i++) {
    const entry = hashes[i];
    let match = false;
    if (entry.startsWith("$2")) {
      match = await bcrypt.compare(needle, entry);
    } else {
      // legado: comparação case-insensitive
      match = normalizeBackupCode(entry) === needle;
    }
    if (match) {
      const next = [...hashes];
      next.splice(i, 1);
      return next;
    }
  }
  return null;
}

/** Fingerprint estável para logs (não é o código). */
export function backupCodeFingerprint(code: string): string {
  return createHash("sha256")
    .update(normalizeBackupCode(code))
    .digest("hex")
    .slice(0, 12);
}
