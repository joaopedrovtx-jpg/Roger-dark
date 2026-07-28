/** Fuso do produto (Brasil). Sempre usar ao exibir instantes ISO da API. */
export const APP_TIMEZONE = "America/Sao_Paulo";

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Nome de produto/descrição no histórico:
 * troca traços (—, –, -) por espaço — nunca exibe o sinal "-".
 * Ex.: "TDAH na Prática — Kit Essencial" → "TDAH na Prática Kit Essencial"
 */
export function formatProductLabel(
  raw: string | null | undefined,
  fallback = "Pagamento PIX"
): string {
  let s = String(raw ?? "")
    .replace(/\b(undefined|null)\b/gi, "")
    .trim();
  if (!s) return fallback;
  // Em dash, en dash, hyphen, minus e similares → espaço
  s = s.replace(/[\u2014\u2013\u2012\u2010\u2212\-]+/g, " ");
  // Colapsa espaços
  s = s.replace(/\s+/g, " ").trim();
  return s || fallback;
}

/**
 * Rótulo de taxa (PIX / saque) conforme o plano da conta:
 * - só % → "3%"
 * - só fixo → "R$ 2,00"
 * - ambos → "3% + R$ 2,00"
 * - nenhum → "Sem taxa"
 *
 * 0 é valor válido (não exibir componente zerado).
 */
export function formatFeeLabel(
  percent: number | null | undefined,
  fixed: number | null | undefined
): string {
  const p = Number(percent);
  const f = Number(fixed);
  const hasP = Number.isFinite(p) && p > 0;
  const hasF = Number.isFinite(f) && f > 0;
  if (!hasP && !hasF) return "Sem taxa";

  const parts: string[] = [];
  if (hasP) {
    const pct = p.toLocaleString("pt-BR", {
      minimumFractionDigits: Number.isInteger(p) ? 0 : 2,
      maximumFractionDigits: 4,
    });
    parts.push(`${pct}%`);
  }
  if (hasF) {
    parts.push(formatBRL(f));
  }
  return parts.join(" + ");
}

/** @deprecated use formatFeeLabel */
export const formatSaqueFeeLabel = formatFeeLabel;

/** Número de taxa: 0 é válido. Só usa fallback se NaN/null/undefined. */
export function feeNumber(
  value: unknown,
  fallback = 0
): number {
  if (value == null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Data + hora no fuso de Brasília (dd/mm/aaaa HH:mm).
 * Corrige o bug de mostrar o horário UTC cru do ISO (`T21:49:03.000Z` → 18:49 BRT).
 */
export function formatDateTime(
  iso: string | null | undefined
): string {
  if (iso == null) return " ";
  const raw = String(iso).trim();
  if (
    !raw ||
    raw === "undefined" ||
    raw === "null" ||
    raw.includes("undefined") ||
    raw.includes("null")
  ) {
    return " ";
  }

  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return " ";
  const dt = new Date(t);
  if (!Number.isFinite(dt.getTime()) || dt.getFullYear() <= 1970) return " ";

  try {
    const parts = new Intl.DateTimeFormat("pt-BR", {
      timeZone: APP_TIMEZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(dt);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";

    const day = get("day");
    const month = get("month");
    const year = get("year");
    let hour = get("hour");
    const minute = get("minute");
    // Alguns engines devolvem "24" para meia-noite com hour12:false
    if (hour === "24") hour = "00";

    if (!day || !month || !year) return " ";
    if (!hour || !minute) return `${day}/${month}/${year}`;
    return `${day}/${month}/${year} ${hour}:${minute}`;
  } catch {
    return " ";
  }
}

export function formatCompactK(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return String(value);
}

function parseChartParts(
  iso: string | null | undefined
): { d: string; m: string; y: string } | null {
  if (iso == null) return null;
  const raw = String(iso).trim();
  if (
    !raw ||
    raw === "undefined" ||
    raw === "null" ||
    raw.includes("undefined") ||
    raw.includes("null")
  ) {
    return null;
  }

  // Já dd/mm/yyyy
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return { d: br[1], m: br[2], y: br[3] };

  // ISO ou YYYY-MM-DD
  const mIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return { y: mIso[1], m: mIso[2], d: mIso[3] };

  const t = Date.parse(raw);
  if (Number.isFinite(t)) {
    const dt = new Date(t);
    const y = dt.getFullYear();
    if (!Number.isFinite(y) || y <= 1970) return null;
    return {
      y: String(y),
      m: String(dt.getMonth() + 1).padStart(2, "0"),
      d: String(dt.getDate()).padStart(2, "0"),
    };
  }
  return null;
}

/**
 * Data do gráfico em dd/mm/yyyy (tooltip / detalhe).
 * Nunca devolve "undefined/undefined/…" invalido vira "-".
 */
export function formatChartDate(iso: string | null | undefined): string {
  const p = parseChartParts(iso);
  if (!p) return " ";
  return `${p.d}/${p.m}/${p.y}`;
}

/** Eixo X compacto: só dia/mês (ex.: 23/12) */
export function formatChartDateShort(iso: string | null | undefined): string {
  const p = parseChartParts(iso);
  if (!p) return " ";
  return `${p.d}/${p.m}`;
}

/** Rótulo do eixo X: hora (00h–23h) ou data dd/mm (compacto) */
export function formatChartLabel(
  iso: string | null | undefined,
  grain: "hour" | "day" = "day"
): string {
  if (iso == null || String(iso).trim() === "") return " ";
  const raw = String(iso);
  if (grain === "hour") {
    // "2025-12-23T14:00" ou "2025-12-23T14:00:00"
    const time = raw.includes("T") ? raw.split("T")[1] : "";
    const hour = (time || "").slice(0, 2);
    if (!/^\d{2}$/.test(hour)) return " ";
    return `${hour}h`;
  }
  return formatChartDateShort(raw);
}
