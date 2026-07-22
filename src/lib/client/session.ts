/**
 * Sessão no browser: SOMENTE cookie httpOnly (credentials: include).
 * Não guarda token em sessionStorage (evita XSS roubar sessão).
 */

import {
  getImpersonateSeller,
  VIEW_SELLER_HEADER,
} from "@/lib/client/impersonate";
import { reportClientBug } from "@/lib/client/bug-report";

/** @deprecated no-op: token não é mais persistido no JS */
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

/** fetch autenticado: cookie + header de visualização de seller (staff) */
export async function authedFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  // Prova social: staff visualizando conta do seller
  if (!headers.has(VIEW_SELLER_HEADER)) {
    const view = getImpersonateSeller();
    if (view?.id) {
      headers.set(VIEW_SELLER_HEADER, view.id);
    }
  }

  const method = (init?.method || "GET").toUpperCase();
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch (err) {
    reportClientBug({
      message: err instanceof Error ? err.message : "Falha de rede",
      stack: err instanceof Error ? err.stack : undefined,
      route: typeof input === "string" ? input : "fetch",
      method,
      code: "network_error",
      meta: {
        online:
          typeof navigator !== "undefined" ? navigator.onLine : undefined,
      },
    });
    throw err;
  }

  // 5xx e 401 de documentos → bug log (dedupe no client)
  if (res.status >= 500 || (res.status === 401 && String(input).includes("/documents"))) {
    let serverMsg = "";
    let bugId: string | undefined;
    try {
      const clone = res.clone();
      const json = (await clone.json()) as {
        error?: string;
        bugId?: string;
      };
      serverMsg = json.error || "";
      bugId = json.bugId;
    } catch {
      /* ignore */
    }
    reportClientBug({
      message: serverMsg || `HTTP ${res.status} em ${input}`,
      route: typeof input === "string" ? input.split("?")[0] : "fetch",
      method,
      statusCode: res.status,
      code: bugId ? `server_bug:${bugId}` : `http_${res.status}`,
      meta: { bugId },
    });
  }

  return res;
}
