/**
 * Modo "visualizar seller" (prova social).
 * Staff grava o alvo no localStorage; o painel seller + APIs usam o header
 * X-DarkPay-View-Seller. Saques e ações de escrita ficam bloqueados.
 */

export const IMPERSONATE_STORAGE_KEY = "darkpay.impersonate.seller";
export const VIEW_SELLER_HEADER = "X-DarkPay-View-Seller";

export interface ImpersonateSeller {
  id: string;
  name: string;
  email?: string;
  at: string;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function getImpersonateSeller(): ImpersonateSeller | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(IMPERSONATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ImpersonateSeller>;
    if (!parsed?.id || !parsed?.name) return null;
    return {
      id: String(parsed.id),
      name: String(parsed.name),
      email: parsed.email ? String(parsed.email) : undefined,
      at: parsed.at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function setImpersonateSeller(input: {
  id: string;
  name: string;
  email?: string;
}): void {
  const s = storage();
  if (!s) return;
  const payload: ImpersonateSeller = {
    id: input.id,
    name: input.name,
    email: input.email,
    at: new Date().toISOString(),
  };
  s.setItem(IMPERSONATE_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(
    new CustomEvent("darkpay:impersonate", { detail: payload })
  );
}

export function clearImpersonateSeller(): void {
  const s = storage();
  if (!s) return;
  s.removeItem(IMPERSONATE_STORAGE_KEY);
  window.dispatchEvent(
    new CustomEvent("darkpay:impersonate", { detail: null })
  );
}

export function isImpersonating(): boolean {
  return Boolean(getImpersonateSeller()?.id);
}
