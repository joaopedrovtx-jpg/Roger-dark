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

/** Favicon do site usado na notificação (versão 192px otimizada). */
export const SITE_NOTIFICATION_ICON_PATH = "/Fiveicon-notif.png";
export const SITE_FAVICON_PATH = "/Fiveicon.png";

/**
 * Som de caixa registradora (venda gerada + venda aprovada).
 * Arquivo do usuário em public/sounds/cash-register.mp3
 * ?v= força o browser a não usar cache do WAV antigo.
 * Só os primeiros CASH_REGISTER_MAX_SECONDS segundos tocam.
 */
export const CASH_REGISTER_SOUND_PATH = "/sounds/cash-register.mp3";
export const CASH_REGISTER_SOUND_URL = `${CASH_REGISTER_SOUND_PATH}?v=caixa-user-1`;
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
 * Lista de fontes do favicon do site (nunca hostname / logo genérico do projeto).
 */
function collectIconCandidates(origin: string): string[] {
  const out: string[] = [];

  try {
    const brand = loadBranding();
    if (brand?.faviconUrl) out.push(brand.faviconUrl);
  } catch {
    // ignore
  }

  if (typeof document !== "undefined") {
    document
      .querySelectorAll<HTMLLinkElement>(
        "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
      )
      .forEach((link) => {
        const href = link.getAttribute("href") || link.href || "";
        if (href) out.push(href);
      });
  }

  // Favicon oficial do site (otimizado + full)
  out.push(SITE_NOTIFICATION_ICON_PATH, SITE_FAVICON_PATH);
  return out
    .map((h) => toAbsoluteUrl(h, origin))
    .filter((h): h is string => Boolean(h));
}

/**
 * Carrega o favicon do site e devolve data:image/... (melhor suporte no Mac).
 * Síncrono de fallback: path absoluto.
 */
export function resolveNotificationIcon(): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedIconDataUrl) return cachedIconDataUrl;
  return `${window.location.origin}${SITE_NOTIFICATION_ICON_PATH}`;
}

export async function resolveNotificationIconAsync(): Promise<
  string | undefined
> {
  if (typeof window === "undefined") return undefined;
  if (cachedIconDataUrl) return cachedIconDataUrl;
  if (iconLoadPromise) return iconLoadPromise;

  iconLoadPromise = (async () => {
    const origin = window.location.origin;
    const candidates = collectIconCandidates(origin);

    for (const src of candidates) {
      try {
        if (src.startsWith("data:image/")) {
          // data: muito grande falha no Safari — usa Fiveicon se > ~200KB
          if (src.length > 200_000) continue;
          cachedIconDataUrl = src;
          return src;
        }

        const res = await fetch(src, { cache: "force-cache", mode: "cors" });
        if (!res.ok) continue;
        const blob = await res.blob();
        if (blob.size === 0) continue;
        // content-type vazio em alguns static servers — ainda tenta
        if (blob.type && !blob.type.startsWith("image/")) continue;
        // Limita tamanho embutido (Safari)
        if (blob.size > 180_000) continue;
        const dataUrl = await blobToDataUrl(blob);
        cachedIconDataUrl = dataUrl;
        return dataUrl;
      } catch {
        // tenta próximo candidato
      }
    }

    return `${origin}${SITE_NOTIFICATION_ICON_PATH}`;
  })();

  try {
    return await iconLoadPromise;
  } finally {
    iconLoadPromise = null;
  }
}

/**
 * Só o que importa na notificação:
 * - title: "Venda gerada" | "Venda aprovada"
 * - body: valor em R$ (ex.: "R$ 297,00")
 * Nunca inclui hostname, cliente, produto ou localhost.
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
    // Título limpo (sem domínio). Valor no body — o que o usuário lê.
    title: kindLabel,
    body: value,
  };
}

/** Player só para desbloqueio silencioso de autoplay (nunca toca o cha-ching sozinho). */
let unlockAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
/**
 * Retry curto APÓS uma venda real (não fica pendente para sempre).
 * Evita o bug de tocar no clique/foco aleatório.
 */
let pendingSaleSoundUntil = 0;
let cashStopTimer: ReturnType<typeof setTimeout> | null = null;
/** Dedupe: mesma venda (id+kind) não toca de novo */
const playedSaleSoundKeys = new Set<string>();

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

/** Para o áudio exatamente em CASH_REGISTER_MAX_SECONDS (só os 2s iniciais). */
function limitCashRegisterDuration(audio: HTMLAudioElement): void {
  if (cashStopTimer) {
    clearTimeout(cashStopTimer);
    cashStopTimer = null;
  }

  const stop = () => {
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
  };

  const onTime = () => {
    if (audio.currentTime >= CASH_REGISTER_MAX_SECONDS) stop();
  };

  audio.addEventListener("timeupdate", onTime);
  cashStopTimer = setTimeout(stop, CASH_REGISTER_MAX_SECONDS * 1000 + 50);
}

/**
 * Só libera autoplay (silencioso). NÃO toca o som de venda por conta própria,
 * exceto se uma venda acabou de falhar autoplay (janela ~2.5s).
 */
export function unlockNotificationAudio(): void {
  if (typeof window === "undefined") return;

  // Retry curto: só se uma venda pediu som agora pouco
  const canRetrySaleSound = Date.now() < pendingSaleSoundUntil;

  if (audioUnlocked) {
    if (canRetrySaleSound) {
      pendingSaleSoundUntil = 0;
      playCashRegisterSoundRaw();
    }
    return;
  }

  const audio = getUnlockAudio();
  if (!audio) return;

  try {
    audio.muted = true;
    audio.volume = 0;
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.then === "function") {
      void p
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audioUnlocked = true;
          if (canRetrySaleSound && Date.now() < pendingSaleSoundUntil + 50) {
            pendingSaleSoundUntil = 0;
            playCashRegisterSoundRaw();
          }
        })
        .catch(() => {
          /* ainda bloqueado */
        });
    } else {
      audio.pause();
      audioUnlocked = true;
    }
  } catch {
    /* ignore */
  }
}

/** Toca o MP3 (2s). Sem marcar pendência eterna. */
function playCashRegisterSoundRaw(): void {
  if (typeof window === "undefined") return;
  try {
    const once = new Audio(CASH_REGISTER_SOUND_URL);
    once.preload = "auto";
    once.volume = 1;
    once.muted = false;
    once.setAttribute("playsinline", "true");

    const p = once.play();
    if (p && typeof p.then === "function") {
      void p
        .then(() => {
          audioUnlocked = true;
          limitCashRegisterDuration(once);
        })
        .catch(() => {
          // Autoplay bloqueado: permite 1 retry nos próximos 2.5s se o user interagir
          pendingSaleSoundUntil = Date.now() + 2500;
        });
    } else {
      limitCashRegisterDuration(once);
    }
  } catch {
    pendingSaleSoundUntil = Date.now() + 2500;
  }
}

/**
 * Som de caixa registradora — SOMENTE venda gerada (pendente) ou aprovada (paga).
 * Nunca deve tocar “do nada” (clique, foco, troca de aba).
 */
export function playCashRegisterSound(saleKey?: string): void {
  if (typeof window === "undefined") return;

  if (saleKey) {
    if (playedSaleSoundKeys.has(saleKey)) return;
    playedSaleSoundKeys.add(saleKey);
    // evita crescimento infinito
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

async function createSystemNotification(
  title: string,
  body: string,
  tag: string
): Promise<Notification> {
  const icon =
    (await resolveNotificationIconAsync()) || resolveNotificationIcon();

  const opts: NotificationOptions = {
    body,
    tag,
    // Nunca deixe o body vazio — no Mac o SO preenche com lixo/origem
    lang: "pt-BR",
    dir: "ltr",
    // Silencia o ding padrão do SO: o som da venda é a caixa registradora
    silent: true,
    requireInteraction: false,
  };

  if (icon) {
    opts.icon = icon;
    // Chrome Android/Windows: imagem de conteúdo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (opts as any).image = icon;
    // Android badge (monocromático ideal; colorido ainda ajuda em alguns)
    opts.badge = icon;
  }

  return new Notification(title, opts);
}

/**
 * Notificação nativa do dispositivo.
 * @param options.force ignora prefs (botão Testar)
 */
export async function showSaleBrowserNotification(
  prefs: NotificationPrefs,
  payload: SaleNotifyPayload,
  options?: { force?: boolean }
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
  // tag sem origem/hostname — só tipo + id opcional
  const idPart =
    payload.id && !payload.id.startsWith("sim-")
      ? payload.id.slice(0, 24)
      : `${Date.now()}`;
  const tag = `venda-${payload.kind}-${idPart}`;

  try {
    // Som toca no SaleNotificationsProvider (automático) para não duplicar.
    // Pré-aquece ícone antes de criar a notificação
    await resolveNotificationIconAsync();
    const n = await createSystemNotification(title, body, tag);

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
