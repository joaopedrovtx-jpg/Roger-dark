/**
 * Fuso único do produto (Brasil).
 * Usado em períodos de dashboard, gráfico e chaves de dia/hora.
 */

export const APP_TIMEZONE = "America/Sao_Paulo";

/** Partes calendário no fuso do app */
export function zonedParts(
  date: Date | string | number,
  timeZone: string = APP_TIMEZONE
): { y: number; m: number; d: number; h: number; min: number } {
  const dt = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(dt);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "0";

  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")),
    min: Number(get("minute")),
  };
}

/** YYYY-MM-DD no fuso do app */
export function toISODateInZone(
  date: Date | string | number,
  timeZone: string = APP_TIMEZONE
): string {
  const { y, m, d } = zonedParts(date, timeZone);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** YYYY-MM-DDTHH:00 no fuso do app (bucket horário) */
export function toISOHourInZone(
  date: Date | string | number,
  timeZone: string = APP_TIMEZONE
): string {
  const { y, m, d, h } = zonedParts(date, timeZone);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00`;
}

/**
 * Meia-noite do "dia civil" em São Paulo, convertida para Instant UTC.
 * offsetDays: 0 = hoje (SP), 1 = ontem (SP), etc.
 */
export function startOfZonedDay(
  offsetDays = 0,
  timeZone: string = APP_TIMEZONE,
  now: Date = new Date()
): Date {
  const { y, m, d } = zonedParts(now, timeZone);
  // Âncora: meio-dia UTC no calendário SP evita ambiguidade de DST
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  noonUtc.setUTCDate(noonUtc.getUTCDate() - offsetDays);
  const p = zonedParts(noonUtc, timeZone);
  // Encontra o UTC cujo horário em SP é 00:00:00 desse dia
  // Itera: candidate = UTC(y,m,d,3) approx BRT; refine by checking zoned hour
  let candidate = new Date(Date.UTC(p.y, p.m - 1, p.d, 3, 0, 0)); // BRT ≈ UTC-3
  for (let i = 0; i < 6; i++) {
    const zp = zonedParts(candidate, timeZone);
    if (
      zp.y === p.y &&
      zp.m === p.m &&
      zp.d === p.d &&
      zp.h === 0 &&
      zp.min === 0
    ) {
      return candidate;
    }
    // Ajuste: se ainda no dia anterior em SP, avança; se já passou meia-noite, volta
    const dayDiff =
      Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(zp.y, zp.m - 1, zp.d);
    if (dayDiff !== 0) {
      candidate = new Date(candidate.getTime() + dayDiff);
      continue;
    }
    candidate = new Date(
      candidate.getTime() - (zp.h * 60 + zp.min) * 60_000
    );
  }
  return candidate;
}

/** Fim do dia SP (23:59:59.999) */
export function endOfZonedDay(
  offsetDays = 0,
  timeZone: string = APP_TIMEZONE,
  now: Date = new Date()
): Date {
  const start = startOfZonedDay(offsetDays, timeZone, now);
  return new Date(start.getTime() + 24 * 60 * 60_000 - 1);
}
