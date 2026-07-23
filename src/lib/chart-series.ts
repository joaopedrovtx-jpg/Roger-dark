/**
 * Série contínua do gráfico (seller + admin).
 * Garante N pontos no período — dias/horas sem venda entram com amount 0.
 * Todo o calendário usa America/Sao_Paulo (mesmo fuso dos saldos/métricas).
 */

import {
  APP_TIMEZONE,
  startOfZonedDay,
  toISODateInZone,
  toISOHourInZone,
  zonedParts,
} from "@/lib/timezone";

export type ChartPeriodKey =
  | "today"
  | "yesterday"
  | "7d"
  | "15d"
  | "30d"
  | "60d"
  | string;

export type ChartGrain = "hour" | "day";

export type ChartSeriesPoint = {
  date: string;
  amount: number;
  grain: ChartGrain;
};

/** Quantidade de dias corridos (eixo diário) por período */
export function daysForPeriod(period: ChartPeriodKey): number {
  switch (period) {
    case "today":
    case "yesterday":
      return 1;
    case "15d":
      return 15;
    case "30d":
      return 30;
    case "60d":
      return 60;
    case "7d":
    default:
      return 7;
  }
}

/** @deprecated use startOfZonedDay — mantido para imports antigos */
export function localDay(offsetDays = 0): Date {
  return startOfZonedDay(offsetDays, APP_TIMEZONE);
}

export function toISODateLocal(d: Date): string {
  return toISODateInZone(d, APP_TIMEZONE);
}

function parseAmountMap(
  points: Array<{ date?: string | null; amount?: number | null }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of points) {
    const raw = p?.date != null ? String(p.date) : "";
    if (!raw) continue;
    const amount = Number.isFinite(Number(p.amount)) ? Number(p.amount) : 0;

    // Já no formato de hora: YYYY-MM-DDTHH:00
    const hourKey = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2})(?::00)?/);
    if (hourKey && (raw.includes("T") || raw.includes(" "))) {
      // Só trata como hora se tiver componente de tempo
      if (/T\d{2}| \d{2}:/.test(raw) || /T\d{2}:00$/.test(raw)) {
        const key = `${hourKey[1]}T${hourKey[2]}:00`;
        map.set(key, (map.get(key) ?? 0) + amount);
        // Também soma no dia (fallback se o eixo for diário)
        map.set(hourKey[1], (map.get(hourKey[1]) ?? 0) + amount);
        continue;
      }
    }

    // Instant ISO completo → converte para dia/hora SP
    if (
      /^\d{4}-\d{2}-\d{2}T/.test(raw) &&
      (raw.includes("Z") || raw.includes("+") || raw.length > 16)
    ) {
      try {
        const dt = new Date(raw);
        if (Number.isFinite(dt.getTime())) {
          const day = toISODateInZone(dt);
          const hour = toISOHourInZone(dt);
          map.set(day, (map.get(day) ?? 0) + amount);
          map.set(hour, (map.get(hour) ?? 0) + amount);
          continue;
        }
      } catch {
        /* fallthrough */
      }
    }

    const dayMatch = raw.match(/(\d{4}-\d{2}-\d{2})/);
    if (dayMatch) {
      const key = dayMatch[1];
      map.set(key, (map.get(key) ?? 0) + amount);
    }
  }
  return map;
}

/** 24 horas do dia (hoje ou ontem) em São Paulo */
export function buildHourlySeries(
  period: "today" | "yesterday",
  sparse: Array<{ date?: string | null; amount?: number | null }> = []
): ChartSeriesPoint[] {
  const dayOffset = period === "today" ? 0 : 1;
  const dayIso = toISODateInZone(startOfZonedDay(dayOffset));
  const amounts = parseAmountMap(sparse);
  const out: ChartSeriesPoint[] = [];
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    const key = `${dayIso}T${hh}:00`;
    // Prefer hour key; se só veio dia inteiro, coloca no bucket 0 (ou distribui no total no dia)
    let amount = amounts.get(key) ?? 0;
    if (amount === 0 && h === 12) {
      // Se API só mandou o dia (sem hora), mostra o total no meio do dia
      // para não sumir do gráfico "hoje"
      const dayTotal = amounts.get(dayIso) ?? 0;
      // Só usa day total se nenhum bucket horário tiver valor
      let anyHour = false;
      for (let i = 0; i < 24; i++) {
        const k = `${dayIso}T${String(i).padStart(2, "0")}:00`;
        if ((amounts.get(k) ?? 0) > 0) {
          anyHour = true;
          break;
        }
      }
      if (!anyHour && dayTotal > 0) amount = dayTotal;
    }
    out.push({
      date: key,
      amount,
      grain: "hour",
    });
  }
  return out;
}

/**
 * Preenche os últimos `days` dias corridos (incluindo hoje SP).
 * Ordem cronológica: mais antigo → mais recente (esq → dir no gráfico).
 */
export function buildDailySeries(
  days: number,
  sparse: Array<{ date?: string | null; amount?: number | null }> = []
): ChartSeriesPoint[] {
  const n = Math.max(1, Math.floor(days));
  const amounts = parseAmountMap(sparse);
  const out: ChartSeriesPoint[] = [];
  // i = n-1 → mais antigo; i = 0 → hoje (SP)
  for (let i = n - 1; i >= 0; i--) {
    const iso = toISODateInZone(startOfZonedDay(i));
    out.push({
      date: iso,
      amount: amounts.get(iso) ?? 0,
      grain: "day",
    });
  }
  return out;
}

/**
 * Série completa para o filtro de período.
 * - today/yesterday → 24h
 * - 7d/15d/30d/60d → N dias com zeros nos vazios
 */
export function fillChartSeries(
  period: ChartPeriodKey,
  sparse: Array<{ date?: string | null; amount?: number | null; grain?: string }> = []
): ChartSeriesPoint[] {
  if (period === "today" || period === "yesterday") {
    return buildHourlySeries(period, sparse);
  }
  return buildDailySeries(daysForPeriod(period), sparse);
}

/** Chave de agregação a partir de um Date (pago) no fuso do app */
export function chartBucketKey(
  date: Date | string,
  grain: ChartGrain
): string {
  return grain === "hour" ? toISOHourInZone(date) : toISODateInZone(date);
}

export { APP_TIMEZONE, zonedParts, toISODateInZone, toISOHourInZone, startOfZonedDay };
