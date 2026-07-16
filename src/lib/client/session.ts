/**
 * Sessão no browser: cookie httpOnly (principal) + token em sessionStorage (backup Bearer).
 * Resolve o caso de cookie Secure/HTTP e algumas falhas de same-site.
 */

const TOKEN_KEY = "darkpay.session.token";

export function saveClientToken(token: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

export function loadClientToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearClientToken() {
  saveClientToken(null);
}

/** fetch autenticado: cookie + Bearer se existir */
export async function authedFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = loadClientToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, {
    ...init,
    credentials: "include",
    headers,
  });
}
