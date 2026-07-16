"use client";

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
import { formatBRL, formatChartLabel } from "@/lib/format";
import { PeriodFilter, type PeriodValue } from "./PeriodFilter";

interface RevenueChartProps {
  data: RevenuePoint[];
  className?: string;
  period?: PeriodValue;
  onPeriodChange?: (period: PeriodValue) => void;
  /** Título do card (default: Faturamento) */
  title?: string;
  /** Rótulo do eixo Y (default: Faturamento) */
  yAxisLabel?: string;
}

export function RevenueChart({
  data,
  className,
  period,
  onPeriodChange,
  title = "Faturamento",
  yAxisLabel = "Faturamento",
}: RevenueChartProps) {
  const isHourly =
    period?.key === "today" ||
    period?.key === "yesterday" ||
    data.some((d) => d.grain === "hour");

  const chartData = data.map((d) => ({
    ...d,
    label: formatChartLabel(d.date, d.grain ?? (isHourly ? "hour" : "day")),
  }));

  const amounts = data.map((d) => d.amount);
  const minY = amounts.length
    ? Math.max(0, Math.floor(Math.min(...amounts) / 50) * 50 - 50)
    : 0;
  const maxY = amounts.length
    ? Math.ceil(Math.max(...amounts) / 50) * 50 + 50
    : 1000;

  // Altura fixa do plot — Recharts some se o pai só tem height %/auto
  const plotHeight = 260;

  return (
    <div
      className={`surface-card flex flex-col w-full ${className ?? ""}`}
      style={{
        padding: "16px 16px 8px",
        borderRadius: "var(--radius-card)",
        height: "100%",
        minHeight: plotHeight + 90,
      }}
    >
      {/* Topo: título à esquerda + filtro à direita */}
      <div className="mb-3 shrink-0 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="font-semibold"
            style={{ fontSize: 20, color: "var(--text-1)" }}
          >
            {title}
          </h2>
        </div>
        <PeriodFilter value={period} onChange={onPeriodChange} />
      </div>

      <div className="w-full" style={{ height: plotHeight, minHeight: plotHeight }}>
        <ResponsiveContainer width="100%" height={plotHeight}>
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
          >
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--green-use)"
                  stopOpacity={0.28}
                />
                <stop
                  offset="100%"
                  stopColor="var(--green-use)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--chart-grid)"
              vertical={false}
              strokeDasharray="0"
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--chart-axis)", fontSize: isHourly ? 9 : 10 }}
              axisLine={false}
              tickLine={false}
              dy={6}
              interval={isHourly ? 2 : "preserveStartEnd"}
              minTickGap={isHourly ? 8 : 4}
              label={{
                value: isHourly ? "Hora" : "Período",
                position: "insideBottom",
                offset: -2,
                fill: "var(--chart-axis)",
                fontSize: 10,
              }}
            />
            <YAxis
              domain={[Math.max(0, minY), maxY]}
              tick={{ fill: "var(--chart-axis)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={44}
              label={{
                value: yAxisLabel,
                angle: -90,
                position: "insideLeft",
                offset: 8,
                fill: "var(--chart-axis)",
                fontSize: 10,
                style: { textAnchor: "middle" },
              }}
            />
            <Tooltip
              cursor={{ stroke: "var(--green-use)", strokeOpacity: 0.25 }}
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
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--green-use)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                    }}
                  >
                    {formatBRL(value)}
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="var(--green-use)"
              strokeWidth={2.5}
              fill="url(#revenueGradient)"
              dot={{
                r: 4,
                fill: "var(--green-use)",
                stroke: "var(--chart-dot-stroke)",
                strokeWidth: 2,
              }}
              activeDot={{
                r: 5,
                fill: "var(--green-use)",
                stroke: "var(--chart-dot-stroke)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
