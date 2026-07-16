/** Preferências de segurança (mock local — 2FA) */

export const SECURITY_STORAGE_KEY = "darkpay.security.v1";

export interface SecurityPrefs {
  /** 2FA (TOTP) ativo */
  twoFactorEnabled: boolean;
  /** Segredo mock (exibição no setup) */
  totpSecret: string;
  /** Códigos de recuperação (mock) */
  backupCodes: string[];
  /** Quando o 2FA foi ativado (ISO) */
  enabledAt: string | null;
}

export const DEFAULT_SECURITY_PREFS: SecurityPrefs = {
  twoFactorEnabled: false,
  totpSecret: "",
  backupCodes: [],
  enabledAt: null,
};

function randomSecret(length = 16): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  // grupos de 4
  return out.match(/.{1,4}/g)?.join(" ") ?? out;
}

function randomBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const n = Math.floor(100000 + Math.random() * 900000);
    codes.push(String(n));
  }
  return codes;
}

export function generateTwoFactorSetup(): {
  secret: string;
  backupCodes: string[];
} {
  return {
    secret: randomSecret(16),
    backupCodes: randomBackupCodes(8),
  };
}

export function loadSecurityPrefs(): SecurityPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_SECURITY_PREFS };
  try {
    const raw = window.localStorage.getItem(SECURITY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SECURITY_PREFS };
    const parsed = JSON.parse(raw) as Partial<SecurityPrefs>;
    return {
      twoFactorEnabled: Boolean(parsed.twoFactorEnabled),
      totpSecret: typeof parsed.totpSecret === "string" ? parsed.totpSecret : "",
      backupCodes: Array.isArray(parsed.backupCodes)
        ? parsed.backupCodes.filter((c) => typeof c === "string")
        : [],
      enabledAt:
        typeof parsed.enabledAt === "string" ? parsed.enabledAt : null,
    };
  } catch {
    return { ...DEFAULT_SECURITY_PREFS };
  }
}

export function saveSecurityPrefs(prefs: SecurityPrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SECURITY_STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(
    new CustomEvent("darkpay:security", { detail: prefs })
  );
}

/**
 * Validação mock do código 2FA.
 * Aceita 6 dígitos; em mock, qualquer código com 6 dígitos funciona
 * (exceto 000000, para simular erro).
 */
export function validateTotpCodeMock(code: string): boolean {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) return false;
  if (digits === "000000") return false;
  return true;
}
