/**
 * Cliente: envia erros ao bug log da API (não bloqueia UI).
 */

type ClientBugPayload = {
  message: string;
  stack?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  code?: string;
  meta?: Record<string, unknown>;
};

const recent = new Map<string, number>();
const DEDUPE_MS = 15_000;

function shouldSend(key: string): boolean {
  const now = Date.now();
  const last = recent.get(key) || 0;
  if (now - last < DEDUPE_MS) return false;
  recent.set(key, now);
  // limpa mapa se crescer
  if (recent.size > 80) {
    for (const [k, t] of recent) {
      if (now - t > DEDUPE_MS * 4) recent.delete(k);
    }
  }
  return true;
}

export function reportClientBug(payload: ClientBugPayload): void {
  if (typeof window === "undefined") return;
  const key = `${payload.route || ""}|${payload.statusCode || ""}|${payload.message.slice(0, 80)}`;
  if (!shouldSend(key)) return;

  const body = {
    source: "client" as const,
    message: payload.message.slice(0, 500),
    stack: payload.stack?.slice(0, 4000),
    route: payload.route || window.location.pathname,
    method: payload.method,
    statusCode: payload.statusCode,
    code: payload.code,
    meta: {
      href: window.location.href,
      online: navigator.onLine,
      ...payload.meta,
    },
  };

  try {
    void fetch("/api/v1/bugs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => null);
  } catch {
    /* ignore */
  }
}

/** Instala handlers globais de erro JS + unhandledrejection (uma vez). */
export function installClientBugHandlers(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __darkpayBugHandlers?: boolean };
  if (w.__darkpayBugHandlers) return;
  w.__darkpayBugHandlers = true;

  window.addEventListener("error", (ev) => {
    reportClientBug({
      message: ev.message || "window.error",
      stack: ev.error?.stack,
      route: window.location.pathname,
      code: "window_error",
      meta: {
        filename: ev.filename,
        lineno: ev.lineno,
        colno: ev.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "unhandledrejection";
    reportClientBug({
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      route: window.location.pathname,
      code: "unhandledrejection",
    });
  });
}
