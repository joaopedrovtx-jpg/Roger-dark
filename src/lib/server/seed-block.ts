/**
 * Guard para login: bloqueia contas de seed em produção.
 * Use ALLOW_SEED_LOGIN=1 explicitamente em prod para override consciente.
 */
const SEED_DOMAINS = ["@darkpay.app", "@darkpay.local", "@darkpay.test"];

export function isSeedEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return SEED_DOMAINS.some((d) => lower.endsWith(d));
}

export function seedLoginAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.ALLOW_SEED_LOGIN === "1") return true;
  return false;
}

export function checkSeedLogin(email: string): { allowed: true } | { allowed: false; reason: string } {
  if (!isSeedEmail(email)) return { allowed: true };
  if (seedLoginAllowed()) return { allowed: true };
  return {
    allowed: false,
    reason:
      "Contas de seed bloqueadas em produção. Use ALLOW_SEED_LOGIN=1 apenas em ambiente isolado.",
  };
}
