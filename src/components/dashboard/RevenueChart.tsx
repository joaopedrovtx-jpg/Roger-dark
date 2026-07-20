"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import { PeriodFilter, type PeriodValue } from "./PeriodFilter";

interface RevenueChartProps {
  data: RevenuePoint[];
  className?: string;
  period?: PeriodValue;
  onPeriodChange?: (period: PeriodValue) => void;
  /** Padrão seller: Histórico de faturamento */
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
    else if (d !== "—") {
      dateRanges[bucket] = `${dateRanges[bucket].split(" – ")[0]} – ${d}`;
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

/**
 * Gráfico padrão da plataforma (seller e admin).
 * Visual único: card, tipografia, curva, eixos, tooltip, filtro.
 */
export function RevenueChart({
  data,
  className,
  period,
  onPeriodChange,
  title = "Histórico de faturamento",
  subtitle = "Acompanhe o histórico de transações do seu negócio",
  yAxisLabel = "Faturamento",
  hidePeriodFilter = false,
}: RevenueChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const isHourly =
    period?.key === "today" ||
    period?.key === "yesterday" ||
    data.some((d) => d.grain === "hour");

  const isMonthlyWeeks = period?.key === "30d";
  const isSixtyMonths = period?.key === "60d";
  const isBucketed = isMonthlyWeeks || isSixtyMonths;

  const chartData = useMemo(() => {
    if (isMonthlyWeeks) return toWeeklyPoints(data);
    if (isSixtyMonths) return toMonthlyPoints(data);

    let points = data.map((d) => {
      const grain = d.grain ?? (isHourly ? "hour" : "day");
      let label = formatChartLabel(d.date, grain);
      if (label === "—" || /undefined|null/i.test(label)) {
        const m = String(d.date || "").match(/(\d{4})-(\d{2})-(\d{2})/);
        label = m ? `${m[3]}/${m[2]}` : "—";
      }
      const fullDate =
        grain === "hour"
          ? label
          : formatChartDate(d.date) !== "—"
            ? formatChartDate(d.date)
            : label;
      return {
        amount: Number.isFinite(Number(d.amount)) ? Number(d.amount) : 0,
        label,
        fullDate,
        _sortKey: String(d.date || "").slice(0, 10),
      } satisfies ChartRow;
    });

    if (period?.key === "7d") {
      points = [...points]
        .sort((a, b) => b._sortKey.localeCompare(a._sortKey))
        .slice(0, 7);
      return points.filter((d) => d.label !== "—");
    }

    if (period?.key === "15d") {
      points = [...points]
        .sort((a, b) => b._sortKey.localeCompare(a._sortKey))
        .slice(0, 15);
      return points.filter((d) => d.label !== "—");
    }

    if (!isHourly && points.length > 1) {
      points = [...points].sort((a, b) =>
        b._sortKey.localeCompare(a._sortKey)
      );
    }

    return points.filter((d) => d.label !== "—");
  }, [data, isHourly, isMonthlyWeeks, isSixtyMonths, period?.key]);

  const displayData = useMemo(() => {
    if (chartData.length > 0) return chartData;
    if (isMonthlyWeeks) return toWeeklyPoints([]);
    if (isSixtyMonths) return toMonthlyPoints([]);
    const now = new Date();
    const rows: ChartRow[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      rows.push({
        amount: 0,
        label: formatChartLabel(iso, "day"),
        fullDate: formatChartDate(iso),
        _sortKey: iso,
      });
    }
    return rows.reverse();
  }, [chartData, isMonthlyWeeks, isSixtyMonths]);

  const amounts = displayData.map((d) => d.amount);
  const minRaw = amounts.length ? Math.min(...amounts) : 0;
  const maxRaw = amounts.length ? Math.max(...amounts) : 0;
  const pad = Math.max(50, (maxRaw - minRaw) * 0.12 || 100);
  const minY =
    maxRaw <= 0 ? 0 : Math.max(0, Math.floor((minRaw - pad) / 50) * 50);
  const maxY =
    maxRaw <= 0 ? 100 : Math.ceil((maxRaw + pad) / 50) * 50 || 100;

  // Altura fixa do plot — igual nas duas dashboards (padrão seller)
  const plotHeight = 260;
  const line = "var(--chart-line)";
  const grid = "var(--chart-grid)";
  const axis = "var(--chart-axis)";

  const xAxisTitle = isHourly
    ? "Hora"
    : isMonthlyWeeks
      ? "Semanas"
      : isSixtyMonths
        ? "Meses"
        : "Período";

  return (
    <div
      className={`surface-card flex flex-col w-full min-w-0 ${className ?? ""}`}
      style={{
        padding: "16px 16px 8px",
        borderRadius: "var(--radius-card)",
        height: "100%",
        minHeight: plotHeight + 100,
      }}
    >
      {/* Cabeçalho padrão: título + subtítulo | filtro */}
      <div className="mb-3 shrink-0 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2
            className="font-semibold"
            style={{
              margin: 0,
              fontSize: 16,
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

      {/* Plot — mesma altura e margens do gráfico do seller */}
      <div
        className="w-full min-w-0"
        style={{ height: plotHeight, minHeight: plotHeight }}
      >
        <ResponsiveContainer width="100%" height={plotHeight}>
          <AreaChart
            data={displayData}
            margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
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
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--chart-line)"
                  stopOpacity={0.28}
                />
                <stop
                  offset="100%"
                  stopColor="var(--chart-line)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke={grid}
              vertical={false}
              strokeDasharray="0"
            />

            <XAxis
              dataKey="label"
              tick={{
                fill: axis,
                fontSize: isBucketed ? 11 : 10,
              }}
              axisLine={false}
              tickLine={false}
              dy={6}
              interval={isHourly ? 2 : isBucketed ? 0 : "preserveStartEnd"}
              minTickGap={isHourly ? 8 : 4}
              label={{
                value: xAxisTitle,
                position: "insideBottom",
                offset: -2,
                fill: axis,
                fontSize: 10,
              }}
            />

            <YAxis
              domain={[minY, maxY]}
              tick={{ fill: axis, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={44}
              label={{
                value: yAxisLabel,
                angle: -90,
                position: "insideLeft",
                offset: 8,
                fill: axis,
                fontSize: 10,
                style: { textAnchor: "middle" },
              }}
            />

            <Tooltip
              cursor={{ stroke: line, strokeOpacity: 0.25 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const value = Number(payload[0]?.value ?? 0);
                const row = payload[0]?.payload as ChartRow;
                const dateLine = isBucketed
                  ? row?.label || ""
                  : row?.fullDate || row?.label || "";
                return (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-card)",
                      borderRadius: "var(--radius-md)",
                      padding: "8px 12px",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                    }}
                  >
                    {dateLine ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: axis,
                          marginBottom: 4,
                          fontWeight: 500,
                        }}
                      >
                        {dateLine}
                      </div>
                    ) : null}
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: line,
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
              strokeWidth={2.5}
              fill="url(#revenueGradient)"
              isAnimationActive
              animationDuration={500}
              animationEasing="ease-out"
              activeDot={{
                r: 5,
                fill: "var(--chart-dot-fill)",
                stroke: "var(--chart-dot-stroke)",
                strokeWidth: 2,
              }}
              dot={(props) => {
                const { cx, cy, index } = props as {
                  cx?: number;
                  cy?: number;
                  index?: number;
                };
                if (cx == null || cy == null) return null;
                const active = hoverIndex === index;
                return (
                  <circle
                    key={`dot-${index}`}
                    cx={cx}
                    cy={cy}
                    r={active ? 5 : 4}
                    fill="var(--chart-dot-fill)"
                    stroke="var(--chart-dot-stroke)"
                    strokeWidth={2}
                    style={{ cursor: "pointer" }}
                  />
                );
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
