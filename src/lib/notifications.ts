/**
 * Preferências e helpers de notificação do navegador (seller).
 * Notification API → Central de Notificações do macOS (Safari / Chrome).
 * Venda gerada + venda aprovada (paga) — sem pendente.
 */

export const NOTIFICATIONS_STORAGE_KEY = "darkpay.notifications.v1";

export type SaleNotifyKind = "gerada" | "aprovada";

export interface NotificationPrefs {
  browserEnabled: boolean;
  vendaGerada: boolean;
  vendaAprovada: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  browserEnabled: false,
  vendaGerada: true,
  vendaAprovada: true,
};

export interface NotifyResult {
  ok: boolean;
  reason?: string;
}

export function loadNotificationPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_NOTIFICATION_PREFS };
  try {
    const raw = window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      browserEnabled: Boolean(parsed.browserEnabled),
      vendaGerada:
        parsed.vendaGerada === undefined
          ? DEFAULT_NOTIFICATION_PREFS.vendaGerada
          : Boolean(parsed.vendaGerada),
      vendaAprovada:
        parsed.vendaAprovada === undefined
          ? DEFAULT_NOTIFICATION_PREFS.vendaAprovada
          : Boolean(parsed.vendaAprovada),
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    NOTIFICATIONS_STORAGE_KEY,
    JSON.stringify(prefs)
  );
  window.dispatchEvent(
    new CustomEvent("darkpay:notifications", { detail: prefs })
  );
}

export function isNotificationApiSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Safari / Apple WebKit (macOS e iOS) */
export function isSafariBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isSafari =
    /Safari/i.test(ua) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/i.test(ua);
  return isSafari;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isNotificationApiSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Pede permissão. No Safari, precisa ser no gesto do clique
 * e a notificação idealmente logo em seguida no mesmo fluxo.
 */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!isNotificationApiSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";

  try {
    const result = Notification.requestPermission();
    if (
      result &&
      typeof (result as Promise<NotificationPermission>).then === "function"
    ) {
      return await result;
    }
    return await new Promise<NotificationPermission>((resolve) => {
      // API legada (callback) — Safari antigo
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Notification.requestPermission as any)(
        (perm: NotificationPermission) => resolve(perm)
      );
    });
  } catch {
    return Notification.permission;
  }
}

export interface SaleNotifyPayload {
  kind: SaleNotifyKind;
  amount: number;
  customer?: string;
  product?: string;
  id?: string;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Favicon em URL absoluta http(s).
 * Safari costuma rejeitar data: muito grande ou inválido.
 */
export function resolveNotificationIcon(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const origin = window.location.origin;
  const fallback = `${origin}/logo-darkpay-clean.jpg`;

  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  const href = link?.getAttribute("href") || link?.href || "";

  if (!href) return fallback;

  // data: no Safari costuma falhar na Notification — usa logo do site
  if (href.startsWith("data:")) return fallback;

  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("/")) return `${origin}${href}`;
  try {
    return new URL(href, origin).href;
  } catch {
    return fallback;
  }
}

/**
 * Só título + valor (sem cliente, produto, localhost no texto, etc.).
 * Ex.: title "Venda aprovada" · body "R$ 297,00"
 */
export function buildSaleNotificationCopy(payload: SaleNotifyPayload): {
  title: string;
  body: string;
} {
  const title =
    payload.kind === "aprovada" ? "Venda aprovada" : "Venda gerada";
  return {
    title,
    body: formatBRL(payload.amount),
  };
}

/**
 * Notificação limpa no macOS: só título + valor.
 * Sem icon/badge (evita logo roxo e ruído visual); o SO pode ainda
 * mostrar o domínio do site (ex.: localhost em dev — some no domínio real).
 */
function createSystemNotification(
  title: string,
  body: string,
  tag: string
): Notification {
  return new Notification(title, {
    body,
    tag,
  });
}

/**
 * Notificação nativa do SO (macOS Notification Center).
 * @param options.force — ignora prefs (botão Testar)
 */
export function showSaleBrowserNotification(
  prefs: NotificationPrefs,
  payload: SaleNotifyPayload,
  options?: { force?: boolean }
): NotifyResult {
  if (!options?.force) {
    if (!prefs.browserEnabled) {
      return { ok: false, reason: "Notificações do navegador desativadas." };
    }
    if (payload.kind === "gerada" && !prefs.vendaGerada) {
      return { ok: false, reason: "Alerta de venda gerada desativado." };
    }
    if (payload.kind === "aprovada" && !prefs.vendaAprovada) {
      return { ok: false, reason: "Alerta de venda aprovada desativado." };
    }
  }

  if (!isNotificationApiSupported()) {
    return { ok: false, reason: "Este navegador não suporta notificações." };
  }

  if (Notification.permission !== "granted") {
    return {
      ok: false,
      reason:
        Notification.permission === "denied"
          ? "Permissão bloqueada no Safari."
          : "Permissão ainda não concedida.",
    };
  }

  if (payload.kind !== "gerada" && payload.kind !== "aprovada") {
    return { ok: false, reason: "Tipo de venda inválido." };
  }

  const { title, body } = buildSaleNotificationCopy(payload);
  const tag = `darkpay-${payload.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    const n = createSystemNotification(title, body, tag);

    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      try {
        n.close();
      } catch {
        // ignore
      }
      try {
        window.location.assign("/transacoes");
      } catch {
        // ignore
      }
    };

    // NÃO fechar por timer — deixa o macOS / Central de Notificações gerenciar
    return { ok: true };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Falha ao criar notificação do sistema.";
    return { ok: false, reason: msg };
  }
}

/** Emite evento de venda (outros módulos / simulação) */
export function emitSaleEvent(payload: SaleNotifyPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("darkpay:sale", { detail: payload }));
}
