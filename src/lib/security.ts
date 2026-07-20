/**
 * Preferências de segurança no client legado / UI cache leve.
 * 2FA real vive no servidor (MySQL + otplib). Não use isto como fonte da verdade.
 */

export const SECURITY_STORAGE_KEY = "darkpay.security.v1";

export interface SecurityPrefs {
  twoFactorEnabled: boolean;
  totpSecret: string;
  backupCodes: string[];
  enabledAt: string | null;
}

export const DEFAULT_SECURITY_PREFS: SecurityPrefs = {
  twoFactorEnabled: false,
  totpSecret: "",
  backupCodes: [],
  enabledAt: null,
};

/** @deprecated 2FA real é server-side; mantido só se algum código legado importar */
export function generateTwoFactorSetup(): {
  secret: string;
  backupCodes: string[];
} {
  return { secret: "", backupCodes: [] };
}

export function loadSecurityPrefs(): SecurityPrefs {
  return { ...DEFAULT_SECURITY_PREFS };
}

export function saveSecurityPrefs(_prefs: SecurityPrefs): void {
  // no-op: não persistir secret/2FA no localStorage
}

/** @deprecated validação real em /api/v1/auth/2fa */
export function validateTotpCodeMock(_code: string): boolean {
  return false;
}
