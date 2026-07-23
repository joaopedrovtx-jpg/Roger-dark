/**
 * Preferências e helpers de notificação do navegador (seller).
 * Web Notification API: Android, iOS (Safari 16.4+), macOS, Windows, Linux.
 * Conteúdo: "Venda gerada/aprovada" + valor em R$ (sem hostname).
 * Ícone: favicon do site (Fiveicon) embutido como data URL.
 *
 * Nota macOS/Safari: a linha roxa "localhost" e a bússola do Safari
 * são do sistema (origem + app do browser). Não controlamos esses slots
 * pela Web Notification API — só title, body e icon de conteúdo.
 */

import { loadBranding } from "@/lib/branding";

export const NOTIFICATIONS_STORAGE_KEY = "darkpay.notifications.v1";

/**
 * Ícone da notificação (192×192).
 * Preferir sempre este arquivo — não o favicon genérico do Safari.
 * Query ?v= força o browser a recarregar após troca de arte.
 */
export const SITE_NOTIFICATION_ICON_PATH = "/Fiveicon-notif.png";
export const SITE_NOTIFICATION_ICON_VERSION = "v3";
export const SITE_FAVICON_PATH = "/Fiveicon.png";

function notificationIconAbsoluteUrl(origin: string): string {
  return `${origin}${SITE_NOTIFICATION_ICON_PATH}?v=${SITE_NOTIFICATION_ICON_VERSION}`;
}

/**
 * Som de caixa registradora (venda gerada + venda aprovada).
 * Fonte: public/sounds/cash-register.mp3
 * Só os primeiros CASH_REGISTER_MAX_SECONDS segundos tocam.
 */
export const CASH_REGISTER_SOUND_PATH = "/sounds/cash-register.mp3";
/** Bump de query força refresh do cache do browser após troca do arquivo. */
export const CASH_REGISTER_SOUND_URL = `${CASH_REGISTER_SOUND_PATH}?v=cash-register-mp3-v2`;
/** Duração máxima do som da notificação (segundos). */
export const CASH_REGISTER_MAX_SECONDS = 2;

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

/** Ambiente aproximado para mensagens de ajuda */
export function getNotificationPlatformHint(): string {
  if (typeof navigator === "undefined") return "neste dispositivo";
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "no Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "no iPhone/iPad";
  if (/Macintosh|Mac OS X/i.test(ua)) return "no Mac";
  if (/Windows/i.test(ua)) return "no Windows";
  if (/Linux/i.test(ua)) return "no Linux";
  return "neste dispositivo";
}

/**
 * Pede permissão do navegador (prompt nativo do SO/browser).
 * Deve ser chamado a partir de um clique (gesto do usuário).
 */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!isNotificationApiSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";

  try {
    const result = Notification.requestPermission();
    if (
      result &&
      typeof (result as Promise<NotificationPermission>).then === "function"
    ) {
      return await result;
    }
    return await new Promise<NotificationPermission>((resolve) => {
      // API legada (callback) Safari antigo
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

function safeAmount(amount: unknown): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(n) ? n : 0;
}

/** Cache do favicon em data URL (Safari/Chrome no Mac leem melhor que path). */
let cachedIconDataUrl: string | null = null;
let iconLoadPromise: Promise<string | undefined> | null = null;

function toAbsoluteUrl(href: string, origin: string): string | undefined {
  const h = (href || "").trim();
  if (!h) return undefined;
  if (h.startsWith("data:image/")) return h;
  if (h.startsWith("http://") || h.startsWith("https://")) return h;
  if (h.startsWith("/")) return `${origin}${h}`;
  try {
    return new URL(h, origin).href;
  } catch {
    return undefined;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Falha ao ler ícone"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler ícone"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Fontes do ícone da notificação.
 * Prioridade: arte oficial 192px → branding → link rel=icon → favicon full.
 */
function collectIconCandidates(origin: string): string[] {
  const out: string[] = [];

  // 1) SEMPRE a arte oficial da notificação primeiro (Dark Pay)
  out.push(notificationIconAbsoluteUrl(origin));

  try {
    const brand = loadBranding();
    if (brand?.faviconUrl) out.push(brand.faviconUrl);
  } catch {
    // ignore
  }

  if (typeof document !== "undefined") {
    document
      .querySelectorAll<HTMLLinkElement>(
        "link[rel='apple-touch-icon'], link[rel='icon'], link[rel='shortcut icon']"
      )
      .forEach((link) => {
        const href = link.getAttribute("href") || link.href || "";
        if (href) out.push(href);
      });
  }

  out.push(`${origin}${SITE_FAVICON_PATH}`);
  return out
    .map((h) => toAbsoluteUrl(h, origin))
    .filter((h): h is string => Boolean(h));
}

/**
 * Fallback síncrono: URL HTTPS absoluta (Safari usa melhor que data:).
 */
export function resolveNotificationIcon(): string | undefined {
  if (typeof window === "undefined") return undefined;
  // Safari: NÃO preferir data URL no sync path
  if (isSafariBrowser()) {
    return notificationIconAbsoluteUrl(window.location.origin);
  }
  if (cachedIconDataUrl) return cachedIconDataUrl;
  return notificationIconAbsoluteUrl(window.location.origin);
}

/**
 * Resolve o ícone da notificação.
 *
 * Safari/macOS: data:image no option `icon` é IGNORADO e cai no ícone do Safari.
 * Por isso no Safari usamos SEMPRE URL HTTPS absoluta do Fiveicon-notif.png.
 *
 * Chrome/Edge/Android: data URL embutido funciona bem e evita fetch na hora.
 */
export async function resolveNotificationIconAsync(): Promise<
  string | undefined
> {
  if (typeof window === "undefined") return undefined;

  const origin = window.location.origin;
  const absoluteOfficial = notificationIconAbsoluteUrl(origin);

  // Safari / Apple WebKit: URL absoluta HTTPS (não data:)
  if (isSafariBrowser()) {
    // Pré-aquece o cache do browser (não precisa data URL)
    try {
      await fetch(absoluteOfficial, { cache: "force-cache", mode: "cors" });
    } catch {
      /* ignore */
    }
    return absoluteOfficial;
  }

  if (cachedIconDataUrl) return cachedIconDataUrl;
  if (iconLoadPromise) return iconLoadPromise;

  iconLoadPromise = (async () => {
    const candidates = collectIconCandidates(origin);

    for (const src of candidates) {
      try {
        if (src.startsWith("data:image/")) {
          if (src.length > 200_000) continue;
          cachedIconDataUrl = src;
          return src;
        }

        const res = await fetch(src, { cache: "force-cache", mode: "cors" });
        if (!res.ok) continue;
        const blob = await res.blob();
        if (blob.size === 0) continue;
        if (blob.type && !blob.type.startsWith("image/")) continue;
        // Chrome: embute se pequeno
        if (blob.size > 180_000) {
          // usa URL absoluta se arquivo grande
          if (src.startsWith("https://") || src.startsWith("http://")) {
            return src;
          }
          continue;
        }
        const dataUrl = await blobToDataUrl(blob);
        cachedIconDataUrl = dataUrl;
        return dataUrl;
      } catch {
        // tenta próximo
      }
    }

    return absoluteOfficial;
  })();

  try {
    return await iconLoadPromise;
  } finally {
    iconLoadPromise = null;
  }
}

/**
 * Conteúdo da notificação nativa:
 * - title: "Venda gerada" | "Venda aprovada"
 * - body: "Valor da venda R$ 297,00" (mesma linha: texto + valor)
 *
 * Nota: no macOS/Safari o SO ainda mostra o domínio (darkpays.online)
 * na barra do sistema — isso não é controlável pela Web Notification API.
 * O body é o que o usuário lê como “parte de baixo” do conteúdo.
 */
export function buildSaleNotificationCopy(payload: SaleNotifyPayload): {
  title: string;
  body: string;
} {
  const amount = safeAmount(payload.amount);
  const kindLabel =
    payload.kind === "aprovada" ? "Venda aprovada" : "Venda gerada";
  const value = formatBRL(amount);

  return {
    title: kindLabel,
    // Texto + valor na mesma linha (substitui o body que era só o R$)
    body: `Valor da venda ${value}`,
  };
}

/**
 * Áudio de venda — regras anti “som fantasmas minutos depois”:
 * 1) NUNCA deixar play() pendente (Safari/Chrome resolvem no próximo clique).
 * 2) NUNCA re-tocar som no unlock de gesto do usuário.
 * 3) Se play não confirmar em ~350ms, aborta o elemento (mata promise atrasada).
 * 4) Som só no instante da notificação de venda.
 */
let unlockAudio: HTMLAudioElement | null = null;
/** Pré-carrega bytes do MP3 (cache HTTP); não reutilizamos o mesmo element para play. */
let primedCashAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let cashStopTimer: ReturnType<typeof setTimeout> | null = null;
/** Invalida plays atrasados (promise resolvendo depois de minutos). */
let playGeneration = 0;
/** Instância atual em reprodução (para matar ao abortar). */
let activeSaleAudio: HTMLAudioElement | null = null;
/** Dedupe: mesma venda (id+kind) não toca de novo */
const playedSaleSoundKeys = new Set<string>();

function killAudioElement(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  try {
    audio.pause();
  } catch {
    /* ignore */
  }
  try {
    audio.removeAttribute("src");
    audio.load();
  } catch {
    /* ignore */
  }
}

function getUnlockAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return null;
  }
  if (!unlockAudio) {
    unlockAudio = new Audio(CASH_REGISTER_SOUND_URL);
    unlockAudio.preload = "auto";
    unlockAudio.volume = 0;
    unlockAudio.muted = true;
  }
  return unlockAudio;
}

/** Pré-carrega o MP3 em cache (chamado no unlock + bootstrap). Nunca toca sozinho. */
export function primeCashRegisterSound(): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;
  try {
    if (!primedCashAudio) {
      primedCashAudio = new Audio(CASH_REGISTER_SOUND_URL);
      primedCashAudio.preload = "auto";
      primedCashAudio.volume = 0;
      primedCashAudio.muted = true;
      primedCashAudio.setAttribute("playsinline", "true");
    }
    void primedCashAudio.load();
  } catch {
    /* ignore */
  }
}

/** Para o áudio exatamente em CASH_REGISTER_MAX_SECONDS. */
function limitCashRegisterDuration(audio: HTMLAudioElement, gen: number): void {
  if (cashStopTimer) {
    clearTimeout(cashStopTimer);
    cashStopTimer = null;
  }

  const stop = () => {
    if (gen !== playGeneration) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore
    }
    audio.removeEventListener("timeupdate", onTime);
    if (cashStopTimer) {
      clearTimeout(cashStopTimer);
      cashStopTimer = null;
    }
    if (activeSaleAudio === audio) activeSaleAudio = null;
  };

  const onTime = () => {
    if (audio.currentTime >= CASH_REGISTER_MAX_SECONDS) stop();
  };

  audio.addEventListener("timeupdate", onTime);
  cashStopTimer = setTimeout(stop, CASH_REGISTER_MAX_SECONDS * 1000 + 80);
}

/**
 * Só libera autoplay (silencioso). NUNCA toca o cha-ching aqui.
 * O bug antigo: retry de som no próximo clique → som “do nada” minutos depois.
 */
export function unlockNotificationAudio(): void {
  if (typeof window === "undefined") return;

  primeCashRegisterSound();
  if (audioUnlocked) return;

  const audio = getUnlockAudio();
  if (!audio) return;

  try {
    audio.muted = true;
    audio.volume = 0;
    try {
      audio.currentTime = 0;
    } catch {
      /* ignore */
    }
    const p = audio.play();
    if (p && typeof p.then === "function") {
      void p
        .then(() => {
          try {
            audio.pause();
            audio.currentTime = 0;
          } catch {
            /* ignore */
          }
          audioUnlocked = true;
          primeCashRegisterSound();
          // NÃO tocar som de venda aqui
        })
        .catch(() => {
          /* ainda bloqueado — ok */
        });
    } else {
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      audioUnlocked = true;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Toca o cha-ching AGORA ou desiste.
 * Se o browser adiar o play (autoplay), abortamos em 350ms para a promise
 * atrasada não tocar o som em outro momento/página.
 */
function playCashRegisterSoundRaw(): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;

  const gen = ++playGeneration;
  // Mata qualquer play anterior (evita sobreposição e ghosts)
  killAudioElement(activeSaleAudio);
  activeSaleAudio = null;

  const once = new Audio(CASH_REGISTER_SOUND_URL);
  once.preload = "auto";
  once.volume = 1;
  once.muted = false;
  once.setAttribute("playsinline", "true");
  activeSaleAudio = once;

  let settled = false;

  const abortIfLate = () => {
    if (settled || gen !== playGeneration) return;
    settled = true;
    // play não confirmou a tempo → mata o element (promise atrasada vira no-op)
    killAudioElement(once);
    if (activeSaleAudio === once) activeSaleAudio = null;
  };

  // Janela curta: ou toca junto com a notificação, ou não toca
  const failSafe = window.setTimeout(abortIfLate, 350);

  try {
    try {
      once.currentTime = 0;
    } catch {
      /* ignore */
    }

    const p = once.play();
    if (p && typeof p.then === "function") {
      void p
        .then(() => {
          if (gen !== playGeneration) {
            killAudioElement(once);
            return;
          }
          settled = true;
          window.clearTimeout(failSafe);
          audioUnlocked = true;
          limitCashRegisterDuration(once, gen);
        })
        .catch(() => {
          // Autoplay bloqueado — desiste. NÃO agenda retry em clique futuro.
          settled = true;
          window.clearTimeout(failSafe);
          killAudioElement(once);
          if (activeSaleAudio === once) activeSaleAudio = null;
        });
    } else {
      settled = true;
      window.clearTimeout(failSafe);
      limitCashRegisterDuration(once, gen);
    }
  } catch {
    settled = true;
    window.clearTimeout(failSafe);
    killAudioElement(once);
    if (activeSaleAudio === once) activeSaleAudio = null;
  }
}

/**
 * Som de caixa — SOMENTE no mesmo instante da notificação de venda.
 * Nunca em clique/foco/timer solto.
 */
export function playCashRegisterSound(saleKey?: string): void {
  if (typeof window === "undefined") return;

  if (saleKey) {
    if (playedSaleSoundKeys.has(saleKey)) return;
    playedSaleSoundKeys.add(saleKey);
    if (playedSaleSoundKeys.size > 200) {
      const first = playedSaleSoundKeys.values().next().value;
      if (first) playedSaleSoundKeys.delete(first);
    }
  }

  playCashRegisterSoundRaw();
}

/** Prefs permitem som/notificação para este tipo de venda? */
export function shouldAlertSale(
  prefs: NotificationPrefs,
  payload: SaleNotifyPayload,
  force?: boolean
): boolean {
  if (force) return true;
  if (!prefs.browserEnabled) return false;
  if (payload.kind === "gerada") return prefs.vendaGerada;
  if (payload.kind === "aprovada") return prefs.vendaAprovada;
  return false;
}

/** Service Worker que exibe notificação com ícone (melhor no Safari/macOS). */
const NOTIF_SW_URL = "/sw-notifications.js";
let notifSwReg: ServiceWorkerRegistration | null = null;
let notifSwRegisterPromise: Promise<ServiceWorkerRegistration | null> | null =
  null;

/**
 * Registra o SW de notificações (idempotente).
 * Chamado no bootstrap do painel e ao ativar notificações.
 */
export async function ensureNotificationServiceWorker(): Promise<
  ServiceWorkerRegistration | null
> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  if (notifSwReg) return notifSwReg;
  if (notifSwRegisterPromise) return notifSwRegisterPromise;

  notifSwRegisterPromise = (async () => {
    try {
      const reg = await navigator.serviceWorker.register(NOTIF_SW_URL, {
        scope: "/",
        updateViaCache: "none",
      });
      // Aguarda active (necessário para postMessage / showNotification)
      if (reg.installing) {
        await new Promise<void>((resolve) => {
          const sw = reg.installing;
          if (!sw) {
            resolve();
            return;
          }
          sw.addEventListener("statechange", () => {
            if (sw.state === "activated" || sw.state === "redundant") {
              resolve();
            }
          });
        });
      }
      await navigator.serviceWorker.ready;
      notifSwReg = reg;
      return reg;
    } catch (e) {
      console.warn("[notif] service worker não registrado", e);
      return null;
    } finally {
      notifSwRegisterPromise = null;
    }
  })();

  return notifSwRegisterPromise;
}

/**
 * Exibe notificação preferindo Service Worker (ícone Dark Pay).
 * Fallback: `new Notification` (Chrome ok; Safari às vezes força ícone do browser).
 */
async function showSystemNotification(opts: {
  title: string;
  body: string;
  tag: string;
  icon?: string;
}): Promise<"sw" | "window"> {
  const icon =
    opts.icon ||
    (typeof window !== "undefined"
      ? notificationIconAbsoluteUrl(window.location.origin)
      : undefined);

  // 1) Preferir SW.showNotification — melhor chance do ícone Dark Pay no Safari
  //    (new Notification no macOS Safari quase sempre mostra a bússola)
  try {
    const reg = await ensureNotificationServiceWorker();
    if (reg) {
      await reg.showNotification(opts.title, {
        body: opts.body,
        tag: opts.tag,
        icon,
        badge: icon,
        silent: true,
        requireInteraction: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(isSafariBrowser() ? {} : ({ image: icon } as any)),
        data: { url: "/transacoes" },
      });
      return "sw";
    }
  } catch {
    /* cai no fallback */
  }

  // 2) Fallback clássico
  const n = new Notification(opts.title, {
    body: opts.body,
    tag: opts.tag,
    lang: "pt-BR",
    dir: "ltr",
    silent: true,
    requireInteraction: false,
    ...(icon
      ? {
          icon,
          badge: icon,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(isSafariBrowser() ? {} : ({ image: icon } as any)),
        }
      : {}),
  });

  n.onclick = () => {
    try {
      window.focus();
    } catch {
      /* ignore */
    }
    try {
      n.close();
    } catch {
      /* ignore */
    }
    try {
      window.location.assign("/transacoes");
    } catch {
      /* ignore */
    }
  };

  return "window";
}

/**
 * Notificação nativa + som no MESMO instante síncrono.
 * Ícone é resolvido antes; depois: playSound + new Notification juntos.
 */
export async function showSaleBrowserNotification(
  prefs: NotificationPrefs,
  payload: SaleNotifyPayload,
  options?: { force?: boolean; playSound?: boolean }
): Promise<NotifyResult> {
  if (!options?.force) {
    if (!prefs.browserEnabled) {
      return { ok: false, reason: "Notificações desativadas." };
    }
    if (payload.kind === "gerada" && !prefs.vendaGerada) {
      return { ok: false, reason: "Alerta de venda gerada desativado." };
    }
    if (payload.kind === "aprovada" && !prefs.vendaAprovada) {
      return { ok: false, reason: "Alerta de venda aprovada desativado." };
    }
  }

  if (!isNotificationApiSupported()) {
    return {
      ok: false,
      reason:
        "Este navegador não suporta notificações. Use Chrome, Edge, Firefox ou Safari atualizado.",
    };
  }

  if (Notification.permission !== "granted") {
    return {
      ok: false,
      reason:
        Notification.permission === "denied"
          ? "Ative no navegador: cadeado da URL → Notificações → Permitir."
          : "Permita as notificações quando o navegador pedir.",
    };
  }

  if (payload.kind !== "gerada" && payload.kind !== "aprovada") {
    return { ok: false, reason: "Tipo de venda inválido." };
  }

  const { title, body } = buildSaleNotificationCopy(payload);
  const idPart =
    payload.id && !payload.id.startsWith("sim-")
      ? payload.id.slice(0, 24)
      : `${Date.now()}`;
  const tag = `venda-${payload.kind}-${idPart}`;

  try {
    // 1) Ícone HTTPS + SW prontos (antes do tick som+notif)
    const icon =
      (await resolveNotificationIconAsync()) || resolveNotificationIcon();
    await ensureNotificationServiceWorker();

    // 2) Som + notificação no mesmo instante (SW tenta ícone Dark Pay)
    if (options?.playSound !== false) {
      const saleKey = `${payload.kind}:${payload.id || "no-id"}:${payload.amount}`;
      playCashRegisterSound(saleKey);
    }

    await showSystemNotification({ title, body, tag, icon });

    return { ok: true };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Falha ao criar notificação do sistema.";
    return { ok: false, reason: msg };
  }
}

/** Dedupe de eventos de venda (evita double-fire do React setState/Strict Mode) */
const recentSaleEvents = new Map<string, number>();

/** Emite evento de venda real (gerada | aprovada). Sem simulação. */
export function emitSaleEvent(payload: SaleNotifyPayload): void {
  if (typeof window === "undefined") return;
  if (payload.kind !== "gerada" && payload.kind !== "aprovada") return;

  const detail: SaleNotifyPayload = {
    ...payload,
    amount: safeAmount(payload.amount),
  };

  // Dedup por id+kind em 8s (polling / strict mode)
  const key = `${detail.kind}:${detail.id || `${detail.amount}-${Math.floor(Date.now() / 1000)}`}`;
  const now = Date.now();
  const prev = recentSaleEvents.get(key);
  if (prev && now - prev < 8000) return;
  recentSaleEvents.set(key, now);
  if (recentSaleEvents.size > 100) {
    const oldest = recentSaleEvents.keys().next().value;
    if (oldest) recentSaleEvents.delete(oldest);
  }

  window.dispatchEvent(new CustomEvent("darkpay:sale", { detail }));
}
