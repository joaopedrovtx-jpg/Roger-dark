"use client";

import { useMemo, useState } from "react";
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
      dateRanges[bucket] = `${dateRanges[bucket].split(" ")[0]} ${d}`;
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
  title = "Faturamento",
  subtitle,
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
      if (label === "-" || /undefined|null/i.test(label)) {
        const m = String(d.date || "").match(/(\d{4})-(\d{2})-(\d{2})/);
        label = m ? `${m[3]}/${m[2]}` : "-";
      }
      const fullDate =
        grain === "hour"
          ? label
          : formatChartDate(d.date) !== "-"
            ? formatChartDate(d.date)
            : label;
      return {
        amount: Number.isFinite(Number(d.amount)) ? Number(d.amount) : 0,
        label,
        fullDate,
        _sortKey: String(d.date || "").slice(0, 10),
      } satisfies ChartRow;
    });

    // Série diária/horária: sempre da esquerda → direita (cronológico)
    if (period?.key === "7d" || period?.key === "15d") {
      const take = period.key === "7d" ? 7 : 15;
      points = [...points]
        .sort((a, b) => b._sortKey.localeCompare(a._sortKey))
        .slice(0, take)
        .sort((a, b) => a._sortKey.localeCompare(b._sortKey));
      return points.filter((d) => d.label !== "-");
    }

    if (!isHourly && points.length > 1) {
      points = [...points].sort((a, b) =>
        a._sortKey.localeCompare(b._sortKey)
      );
    }

    return points.filter((d) => d.label !== "-");
  }, [data, isHourly, isMonthlyWeeks, isSixtyMonths, period?.key]);

  const displayData = useMemo(() => {
    if (chartData.length > 0) return chartData;
    if (isMonthlyWeeks) return toWeeklyPoints([]);
    if (isSixtyMonths) return toMonthlyPoints([]);
    const now = new Date();
    const rows: ChartRow[] = [];
    // Fallback: últimos 7 dias em ordem cronológica (esq → dir)
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
    return rows;
  }, [chartData, isMonthlyWeeks, isSixtyMonths]);

  const amounts = displayData.map((d) => d.amount);
  const minRaw = amounts.length ? Math.min(...amounts) : 0;
  const maxRaw = amounts.length ? Math.max(...amounts) : 0;
  const pad = Math.max(50, (maxRaw - minRaw) * 0.12 || 100);
  // Lateral: escala de faturamento a partir de 0 até o topo dos valores
  const minY = 0;
  const maxY =
    maxRaw <= 0 ? 100 : Math.ceil((maxRaw + pad) / 50) * 50 || 100;

  /** Ticks do eixo Y (0, …, valores de faturamento) */
  const yTicks = useMemo(() => {
    const steps = 4;
    const out: number[] = [];
    for (let i = 0; i <= steps; i++) {
      out.push(Math.round((maxY / steps) * i));
    }
    return out;
  }, [maxY]);

  // Altura do plot + espaço p/ datas + texto "Período"
  const plotHeight = 290;
  /**
   * Paleta só branco/cinza.
   * Linha da curva e eixos bem finos (mesma “finura” da lateral).
   */
  const line = "#ffffff";
  const axisStroke = "#ffffff";
  /** Mesma espessura da lateral e da base */
  const axisWidth = 1;
  /** Curva do faturamento — fina (antes 2.5 ficava grossa no zero) */
  const curveWidth = 1.25;
  const tickFill = "#ffffff";
  /** Grade na cor do fundo do ícone dos indicadores */
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

  const manyXTicks = displayData.length > 12;
  const xInterval = isHourly
    ? 2
    : isBucketed
      ? 0
      : manyXTicks
        ? "preserveStartEnd"
        : 0;

  return (
    <div
      className={`surface-card flex flex-col w-full min-w-0 ${className ?? ""}`}
      style={{
        padding: "16px 16px 10px",
        borderRadius: "var(--radius-card)",
        height: "100%",
        minHeight: plotHeight + 72,
      }}
    >
      {/* Cabeçalho: título | filtro de período */}
      <div className="mb-2 shrink-0 flex items-start justify-between gap-3">
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

      {/*
        Estrutura de eixos:
        - lateral: Faturamento + escala de valores (0 → …)
        - embaixo: datas + texto "Período"
        - linhas brancas em L
      */}
      <div
        className="w-full min-w-0"
        style={{ height: plotHeight, minHeight: plotHeight }}
      >
        <ResponsiveContainer width="100%" height={plotHeight}>
          <AreaChart
            data={displayData}
            margin={{ top: 12, right: 14, left: 10, bottom: 36 }}
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

            {/* Grade cinza clara (quadriculado) */}
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
                fontSize: isBucketed ? 11 : 10.5,
                fontWeight: 500,
              }}
              // Linha de cima das datas — mesma finura da lateral
              axisLine={{ stroke: axisStroke, strokeWidth: axisWidth }}
              tickLine={false}
              dy={8}
              angle={isBucketed || isHourly ? 0 : -35}
              textAnchor={isBucketed || isHourly ? "middle" : "end"}
              height={isBucketed || isHourly ? 36 : 52}
              interval={xInterval}
              minTickGap={isHourly ? 10 : 2}
              padding={{ left: 8, right: 8 }}
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
                fontSize: 11,
                fontWeight: 500,
              }}
              // Linha lateral (escala de faturamento)
              axisLine={{ stroke: axisStroke, strokeWidth: axisWidth }}
              tickLine={false}
              width={48}
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
              // Coluna do hover: escura (nunca verde)
              cursor={{
                stroke: "var(--bg-card-inner-icon)",
                strokeWidth: 1.25,
                strokeOpacity: 1,
              }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const value = Number(payload[0]?.value ?? 0);
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
              animationDuration={500}
              animationEasing="ease-out"
              activeDot={{
                r: 3.5,
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
                if (cx == null || cy == null) return null;
                const active = hoverIndex === index;
                return (
                  <circle
                    key={`dot-${index}`}
                    cx={cx}
                    cy={cy}
                    r={active ? 3.5 : 2.75}
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
  );
}
