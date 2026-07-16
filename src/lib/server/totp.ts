/**
 * 2FA TOTP real (RFC 6238) via otplib v13+.
 */
import {
  generateSecret as otpGenerateSecret,
  generateURI,
  verifySync,
} from "otplib";

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
    // otplib v13: result may be boolean or { valid }
    if (typeof result === "boolean") return result;
    if (result && typeof result === "object" && "valid" in result) {
      return !!(result as { valid: boolean }).valid;
    }
    return false;
  } catch {
    return false;
  }
}

export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(String(Math.floor(100000 + Math.random() * 900000)));
  }
  return codes;
}
