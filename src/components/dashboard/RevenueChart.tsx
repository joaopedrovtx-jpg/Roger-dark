"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RevenuePoint } from "@/types/dashboard";
import {
  formatBRL,
  formatChartDate,
  formatChartLabel,
} from "@/lib/format";
import { fillChartSeries, daysForPeriod } from "@/lib/chart-series";
import { PeriodFilter, type PeriodValue } from "./PeriodFilter";

interface RevenueChartProps {
  data: RevenuePoint[];
  className?: string;
  period?: PeriodValue;
  onPeriodChange?: (period: PeriodValue) => void;
  /** Padrão seller: Faturamento */
  title?: string;
  subtitle?: string;
  /** Eixo Y curto (seller: Faturamento · admin: Volume) */
  yAxisLabel?: string;
  hidePeriodFilter?: boolean;
}

type ChartRow = {
  amount: number;
  label: string;
  fullDate: string;
  _sortKey: string;
};

const WEEK_LABELS = [
  "1ª semana",
  "2ª semana",
  "3ª semana",
  "4ª semana",
] as const;

const MONTH_LABELS = [
  "1º mês",
  "2º mês",
  "3º mês",
  "4º mês",
  "5º mês",
  "6º mês",
] as const;

/** Agrega pontos diários reais em N buckets (semanas ou meses) */
function toBucketPoints(
  data: RevenuePoint[],
  labels: readonly string[]
): ChartRow[] {
  const count = labels.length;
  const buckets = Array.from({ length: count }, () => 0);
  const dateRanges = Array.from({ length: count }, () => "");

  if (data.length === 0) {
    return labels.map((label, i) => ({
      amount: 0,
      label,
      fullDate: label,
      _sortKey: String(i),
    }));
  }

  const sorted = [...data].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  const n = sorted.length;
  for (let i = 0; i < n; i++) {
    const bucket = Math.min(count - 1, Math.floor((i / n) * count));
    buckets[bucket] += Number(sorted[i].amount) || 0;
    const d = formatChartDate(sorted[i].date);
    if (!dateRanges[bucket]) dateRanges[bucket] = d;
    else if (d !== "-") {
      const first = dateRanges[bucket].split(" – ")[0] || dateRanges[bucket];
      dateRanges[bucket] = `${first} – ${d}`;
    }
  }

  return labels.map((label, i) => ({
    amount: Math.round(buckets[i] * 100) / 100,
    label,
    fullDate: dateRanges[i] || label,
    _sortKey: String(i),
  }));
}

function toWeeklyPoints(data: RevenuePoint[]): ChartRow[] {
  return toBucketPoints(data, WEEK_LABELS);
}

function toMonthlyPoints(data: RevenuePoint[]): ChartRow[] {
  return toBucketPoints(data, MONTH_LABELS);
}

function mapToChartRows(
  points: Array<{ date: string; amount: number; grain?: "hour" | "day" }>,
  isHourly: boolean
): ChartRow[] {
  return points.map((d) => {
    const grain = d.grain ?? (isHourly ? "hour" : "day");
    let label = formatChartLabel(d.date, grain);
    if (label === "-" || /undefined|null/i.test(label)) {
      const m = String(d.date || "").match(/(\d{4})-(\d{2})-(\d{2})/);
      label = m ? `${m[3]}/${m[2]}` : "-";
    }
    const fullDate =
      grain === "hour"
        ? `${formatChartDate(d.date)} · ${label}`
        : formatChartDate(d.date) !== "-"
          ? formatChartDate(d.date)
          : label;
    return {
      amount: Number.isFinite(Number(d.amount)) ? Number(d.amount) : 0,
      label,
      fullDate,
      _sortKey: String(d.date || ""),
    } satisfies ChartRow;
  });
}

/**
 * Gráfico padrão da plataforma (seller e admin).
 * Série contínua por período · eixos legíveis · tooltip com data · responsivo.
 */
export function RevenueChart({
  data,
  className,
  period,
  onPeriodChange,
  title = "Faturamento",
  subtitle,
  yAxisLabel = "Faturamento",
  hidePeriodFilter = false,
}: RevenueChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const periodKey = period?.key ?? "7d";

  const isHourly =
    periodKey === "today" ||
    periodKey === "yesterday" ||
    data.some((d) => d.grain === "hour");

  const isMonthlyWeeks = periodKey === "30d";
  const isSixtyMonths = periodKey === "60d";
  const isBucketed = isMonthlyWeeks || isSixtyMonths;
  const isDailyContinuous =
    periodKey === "7d" || periodKey === "15d" || (!isHourly && !isBucketed);

  const chartData = useMemo(() => {
    if (isMonthlyWeeks) {
      // Preenche 30 dias e agrega em 4 semanas
      const filled = fillChartSeries("30d", data);
      return toWeeklyPoints(filled);
    }
    if (isSixtyMonths) {
      const filled = fillChartSeries("60d", data);
      return toMonthlyPoints(filled);
    }

    // Hoje / ontem / 7d / 15d: série contínua (nunca some dia do eixo)
    const filled = fillChartSeries(periodKey, data);
    return mapToChartRows(filled, isHourly).filter((d) => d.label !== "-");
  }, [data, isHourly, isMonthlyWeeks, isSixtyMonths, periodKey]);

  const displayData = useMemo(() => {
    if (chartData.length > 0) return chartData;
    // Fallback seguro: série zero do período
    if (isMonthlyWeeks) return toWeeklyPoints([]);
    if (isSixtyMonths) return toMonthlyPoints([]);
    const filled = fillChartSeries(periodKey, []);
    return mapToChartRows(filled, isHourly);
  }, [chartData, isHourly, isMonthlyWeeks, isSixtyMonths, periodKey]);

  const amounts = displayData.map((d) => d.amount);
  const maxRaw = amounts.length ? Math.max(...amounts) : 0;
  const pad = Math.max(50, maxRaw * 0.12 || 100);
  const minY = 0;
  const maxY =
    maxRaw <= 0 ? 100 : Math.ceil((maxRaw + pad) / 50) * 50 || 100;

  const yTicks = useMemo(() => {
    const steps = 4;
    const out: number[] = [];
    for (let i = 0; i <= steps; i++) {
      out.push(Math.round((maxY / steps) * i));
    }
    return out;
  }, [maxY]);

  // Altura: mais espaço no mobile para datas; desktop alinha ao card de métricas
  const dayCount = daysForPeriod(periodKey);
  const plotHeight = isNarrow
    ? periodKey === "15d"
      ? 300
      : 270
    : periodKey === "15d"
      ? 310
      : 290;

  const line = "#ffffff";
  const axisStroke = "#ffffff";
  const axisWidth = 1;
  const curveWidth = 1.25;
  const tickFill = "#ffffff";
  const gridStroke = "var(--bg-card-inner-icon)";
  const zeroLine = "var(--bg-card-inner-icon)";
  const dotFill = "#ffffff";
  const dotStroke = "#0c0e12";
  const gradientId = "revenueGradientWhite";

  const xAxisTitle = isHourly
    ? "Hora"
    : isMonthlyWeeks
      ? "Semanas"
      : isSixtyMonths
        ? "Meses"
        : "Período";

  /**
   * Eixo X:
   * - 7d / 15d / buckets → todos os ticks (interval 0)
   * - horário → a cada 2h no mobile, 1h no desktop largo
   * - minTickGap baixo para não sumir label no 15d
   */
  const xInterval = useMemo(() => {
    if (isBucketed) return 0;
    if (isHourly) return isNarrow ? 3 : 2;
    // 7d e 15d: mostrar TODAS as datas do período
    if (periodKey === "7d" || periodKey === "15d") return 0;
    if (displayData.length > 20) return Math.ceil(displayData.length / 12) - 1;
    return 0;
  }, [displayData.length, isBucketed, isHourly, isNarrow, periodKey]);

  const xAngle =
    isBucketed || isHourly ? 0 : periodKey === "15d" || dayCount > 10 ? -42 : -32;
  const xTextAnchor = isBucketed || isHourly ? "middle" : "end";
  const xHeight =
    isBucketed || isHourly ? 36 : periodKey === "15d" ? (isNarrow ? 58 : 54) : 48;
  const xFontSize =
    isBucketed ? 11 : periodKey === "15d" ? (isNarrow ? 9 : 9.5) : 10.5;

  return (
    <div
      className={`surface-card flex flex-col w-full min-w-0 chart-card ${className ?? ""}`}
      style={{
        padding: isNarrow ? "14px 12px 8px" : "16px 16px 10px",
        borderRadius: "var(--radius-card)",
        height: "100%",
        minHeight: plotHeight + 80,
      }}
    >
      {/* Cabeçalho: título | filtro de período */}
      <div className="mb-2 shrink-0 flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <h2
            className="font-semibold"
            style={{
              margin: 0,
              fontSize: isNarrow ? 15 : 16,
              fontWeight: 600,
              color: "#ffffff",
              lineHeight: 1.3,
            }}
          >
            {title}
          </h2>
          {subtitle ? (
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 12.5,
                fontWeight: 400,
                color: "var(--text-3)",
                lineHeight: 1.4,
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {!hidePeriodFilter && period && onPeriodChange ? (
          <PeriodFilter value={period} onChange={onPeriodChange} />
        ) : null}
      </div>

      <div
        className="w-full min-w-0 chart-plot"
        style={{
          height: plotHeight,
          minHeight: plotHeight,
          // Scroll horizontal só se o card ficar muito estreito (mobile + 15d)
          overflowX: isNarrow && periodKey === "15d" ? "auto" : "visible",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          style={{
            width: "100%",
            minWidth:
              isNarrow && periodKey === "15d"
                ? Math.max(320, displayData.length * 28)
                : undefined,
            height: plotHeight,
          }}
        >
          <ResponsiveContainer width="100%" height={plotHeight}>
            <AreaChart
              data={displayData}
              margin={{
                top: 12,
                right: isNarrow ? 8 : 14,
                left: isNarrow ? 2 : 10,
                bottom: isNarrow && periodKey === "15d" ? 8 : 36,
              }}
              onMouseMove={(state) => {
                const idx =
                  typeof state?.activeTooltipIndex === "number"
                    ? state.activeTooltipIndex
                    : null;
                setHoverIndex(idx);
              }}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke={gridStroke}
                strokeWidth={0.75}
                horizontal
                vertical
                strokeDasharray="0"
              />

              <ReferenceLine y={0} stroke={zeroLine} strokeWidth={0.75} />

              <XAxis
                dataKey="label"
                type="category"
                tick={{
                  fill: tickFill,
                  fontSize: xFontSize,
                  fontWeight: 500,
                }}
                axisLine={{ stroke: axisStroke, strokeWidth: axisWidth }}
                tickLine={false}
                dy={8}
                angle={xAngle}
                textAnchor={xTextAnchor}
                height={xHeight}
                interval={xInterval}
                minTickGap={0}
                padding={{ left: 6, right: 6 }}
                label={{
                  value: xAxisTitle,
                  position: "insideBottom",
                  offset: -2,
                  fill: tickFill,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />

              <YAxis
                domain={[minY, maxY]}
                ticks={yTicks}
                tick={{
                  fill: tickFill,
                  fontSize: isNarrow ? 10 : 11,
                  fontWeight: 500,
                }}
                axisLine={{ stroke: axisStroke, strokeWidth: axisWidth }}
                tickLine={false}
                width={isNarrow ? 40 : 48}
                tickFormatter={(v) => {
                  const n = Number(v) || 0;
                  if (n >= 1_000_000) {
                    const m = n / 1_000_000;
                    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
                  }
                  if (n >= 1000) {
                    const k = n / 1000;
                    return Number.isInteger(k) ? `${k}k` : `${k.toFixed(1)}k`;
                  }
                  return String(n);
                }}
                allowDecimals={false}
                label={{
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  offset: 4,
                  fill: tickFill,
                  fontSize: 11,
                  fontWeight: 600,
                  style: { textAnchor: "middle" },
                }}
              />

              <Tooltip
                cursor={{
                  stroke: "var(--bg-card-inner-icon)",
                  strokeWidth: 1.25,
                  strokeOpacity: 1,
                }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as ChartRow | undefined;
                  const value = Number(payload[0]?.value ?? 0);
                  return (
                    <div
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-card)",
                        borderRadius: "var(--radius-md)",
                        padding: "8px 12px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                        minWidth: 112,
                      }}
                    >
                      {row?.fullDate ? (
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: "var(--text-3)",
                            marginBottom: 4,
                          }}
                        >
                          {row.fullDate}
                        </div>
                      ) : null}
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#ffffff",
                        }}
                      >
                        {formatBRL(value)}
                      </div>
                    </div>
                  );
                }}
              />

              <Area
                type="monotone"
                dataKey="amount"
                stroke={line}
                strokeWidth={curveWidth}
                fill={`url(#${gradientId})`}
                isAnimationActive
                animationDuration={450}
                animationEasing="ease-out"
                activeDot={{
                  r: 4,
                  fill: dotFill,
                  stroke: dotStroke,
                  strokeWidth: 1.25,
                }}
                dot={(props) => {
                  const { cx, cy, index } = props as {
                    cx?: number;
                    cy?: number;
                    index?: number;
                  };
                  if (cx == null || cy == null) return <g key={`dot-empty-${index}`} />;
                  const active = hoverIndex === index;
                  // Em 15+ pontos, só destaca o ponto ativo (menos poluição visual)
                  const showAlways =
                    isDailyContinuous && displayData.length <= 10;
                  if (!showAlways && !active) {
                    return <g key={`dot-hide-${index}`} />;
                  }
                  return (
                    <circle
                      key={`dot-${index}`}
                      cx={cx}
                      cy={cy}
                      r={active ? 3.75 : 2.5}
                      fill={dotFill}
                      stroke={dotStroke}
                      strokeWidth={1.25}
                      style={{ cursor: "pointer" }}
                    />
                  );
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
