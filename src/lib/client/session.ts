/**
 * Sessão no browser: SOMENTE cookie httpOnly (credentials: include).
 * Não guarda token em sessionStorage (evita XSS roubar sessão).
 */

/** @deprecated — no-op: token não é mais persistido no JS */
export function saveClientToken(_token?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem("darkpay.session.token");
  } catch {
    /* private mode */
  }
}

export function loadClientToken(): string | null {
  return null;
}

export function clearClientToken() {
  saveClientToken(null);
}

/** fetch autenticado: apenas cookie de sessão (httpOnly) */
export async function authedFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}
