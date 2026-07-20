import type { DashboardData, RevenuePoint } from "@/types/dashboard";
import type { PeriodKey } from "@/components/dashboard/PeriodFilter";
import { dashboardMock } from "./dashboard";

/** quantos dias cada período representa (para escala e série do gráfico) */
const PERIOD_DAYS: Record<PeriodKey, number> = {
  today: 1,
  yesterday: 1,
  "7d": 7,
  "15d": 15,
  "30d": 30,
  "60d": 60,
};

/** fator em relação aos 7 dias (base do mock) */
function scaleFor(key: PeriodKey): number {
  const days = PERIOD_DAYS[key];
  return Math.max(0.12, days / 7);
}

/** variação leve por período (estável, não aleatória) */
function periodBias(key: PeriodKey): number {
  const map: Record<PeriodKey, number> = {
    today: 0.94,
    yesterday: 0.91,
    "7d": 1,
    "15d": 1.04,
    "30d": 1.02,
    "60d": 0.98,
  };
  return map[key];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Hoje local (meia-noite) menos N dias — série real “últimos X dias” */
function calendarDaysAgo(daysOffset = 0): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysOffset);
  return d;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDaysAgo(n: number): string {
  return toISODate(calendarDaysAgo(n));
}

/** curva base normalizada (0–1) para série diária */
const WAVE = [0.35, 0.82, 0.18, 0.8, 0.95, 0.42, 0.28, 0.7, 0.22, 0.38];

/**
 * Perfil horário do faturamento no dia (0–23h).
 * Madrugada baixa, manhã sobe, pico tarde/noite comercial.
 */
const HOUR_PROFILE = [
  0.12, 0.08, 0.06, 0.05, 0.05, 0.1, // 0–5
  0.22, 0.38, 0.55, 0.68, 0.75, 0.82, // 6–11
  0.78, 0.72, 0.7, 0.74, 0.85, 0.95, // 12–17
  0.92, 0.88, 0.7, 0.48, 0.32, 0.18, // 18–23
];

/**
 * Série por hora (24 pontos) — Hoje / Ontem
 * date: YYYY-MM-DDTHH:00
 */
function buildHourlyHistory(key: "today" | "yesterday"): RevenuePoint[] {
  const dayOffset = key === "today" ? 0 : 1;
  const day = calendarDaysAgo(dayOffset);
  const dayIso = toISODate(day);
  const bias = periodBias(key);

  // faturamento total do dia ~ 1/7 do volume diário médio da demo
  const dayTotalBase = 6500 * bias;
  // distribuir pelas horas com perfil (normalizar)
  const profileSum = HOUR_PROFILE.reduce((a, b) => a + b, 0);

  const history: RevenuePoint[] = [];
  for (let h = 0; h < 24; h++) {
    const share = HOUR_PROFILE[h] / profileSum;
    const wobble = 1 + (((h * 13) % 7) - 3) * 0.02;
    const amount = Math.max(0, Math.round(dayTotalBase * share * wobble));
    const hh = String(h).padStart(2, "0");
    history.push({
      date: `${dayIso}T${hh}:00`,
      amount,
      grain: "hour",
    });
  }
  return history;
}

/** Série por dia — exatamente N dias corridos (7 = últimos 7 dias, etc.) */
function buildDailyHistory(key: PeriodKey): RevenuePoint[] {
  const days = PERIOD_DAYS[key];
  // 7d → 7 pontos; 15d → 15; 30d → 28 (4 semanas); 60d → 60 (6 meses)
  const points =
    key === "7d"
      ? 7
      : key === "15d"
        ? 15
        : key === "30d"
          ? 28
          : key === "60d"
            ? 60
            : Math.min(Math.max(days, 1), 30);
  const min = 5800;
  const max = 7600;
  const range = max - min;
  const bias = periodBias(key);

  const history: RevenuePoint[] = [];
  // i=0 = hoje, i=6 = 6 dias atrás → últimos 7 dias
  for (let i = 0; i < points; i++) {
    const wave = WAVE[i % WAVE.length];
    const wobble = ((i * 17) % 10) / 100;
    const amount = round2(
      (min + range * wave * bias + range * wobble * 0.15) *
        (0.92 + scaleFor(key) * 0.04)
    );
    history.push({
      date: isoDaysAgo(i),
      amount: Math.round(amount),
      grain: "day",
    });
  }
  return history;
}

function buildRevenueHistory(key: PeriodKey): RevenuePoint[] {
  if (key === "today" || key === "yesterday") {
    return buildHourlyHistory(key);
  }
  return buildDailyHistory(key);
}

/**
 * Retorna o dashboard inteiro reativo ao período do filtro.
 * KPIs + gráfico + placa usam a mesma base de escala.
 */
export function getDashboardForPeriod(key: PeriodKey): DashboardData {
  const s = scaleFor(key) * periodBias(key);
  const base = dashboardMock;

  const available = round2(base.balances.available * s);
  const pending = round2(base.balances.pending * s);
  const held = round2(base.balances.held * Math.min(1.15, 0.85 + s * 0.15));
  const netProfit = round2(base.metrics.netProfit * s);
  const totalTransactions = Math.max(
    1,
    Math.round(base.metrics.totalTransactions * s)
  );
  const averageTicket = round2(
    base.metrics.averageTicket * (0.96 + periodBias(key) * 0.04)
  );
  const totalOutflows = round2(base.metrics.totalOutflows * s);

  const revenueHistory =
    key === "7d"
      ? base.revenueHistory.map((p) => ({ ...p, grain: "day" as const }))
      : buildRevenueHistory(key);

  const periodRevenue = revenueHistory.reduce((acc, p) => acc + p.amount, 0);

  // placa: faturamento do período vs meta proporcional
  const isHourly = key === "today" || key === "yesterday";
  const volumeCurrent = Math.round(
    key === "7d"
      ? base.volume.current
      : isHourly
        ? periodRevenue
        : periodRevenue * 18
  );
  const volumeGoal = Math.round(
    key === "7d"
      ? base.volume.goal
      : Math.max(volumeCurrent * 1.08, base.volume.goal * s)
  );

  return {
    ...base,
    balances: {
      available: key === "7d" ? base.balances.available : available,
      pending: key === "7d" ? base.balances.pending : pending,
      held: key === "7d" ? base.balances.held : held,
    },
    metrics: {
      netProfit: key === "7d" ? base.metrics.netProfit : netProfit,
      totalTransactions:
        key === "7d" ? base.metrics.totalTransactions : totalTransactions,
      averageTicket:
        key === "7d" ? base.metrics.averageTicket : averageTicket,
      totalOutflows:
        key === "7d" ? base.metrics.totalOutflows : totalOutflows,
    },
    revenueHistory,
    volume: {
      current: Math.min(volumeCurrent, volumeGoal),
      goal: volumeGoal,
    },
  };
}
