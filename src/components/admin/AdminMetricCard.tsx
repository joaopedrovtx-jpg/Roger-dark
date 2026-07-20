import type { ReactNode } from "react";

interface AdminMetricCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Texto auxiliar opcional (ex.: subtítulo) */
  hint?: string;
  action?: ReactNode;
  /** Cor opcional do valor (ex.: vermelho para reembolsos) */
  valueColor?: string;
}

/**
 * Card de indicador mesmo padrão visual do KpiCard da dashboard
 * (ícone 48px, label 12px, valor 18px bold, surface-card).
 */
export function AdminMetricCard({
  icon,
  label,
  value,
  hint,
  action,
  valueColor,
}: AdminMetricCardProps) {
  return (
    <div
      className="surface-card flex items-center gap-3.5 w-full"
      style={{
        padding: "16px 18px",
        minHeight: 88,
        borderRadius: "var(--radius-card)",
        boxSizing: "border-box",
      }}
    >
      <span
        className="flex shrink-0 items-center justify-center"
        style={{
          width: "var(--kpi-icon-size)",
          height: "var(--kpi-icon-size)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-card-inner-icon)",
        }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-0.5 justify-center">
        <span
          className="truncate"
          style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 400 }}
        >
          {label}
        </span>
        <span
          className="tabular truncate font-bold"
          style={{
            fontSize: 18,
            color: valueColor ?? "var(--text-1)",
            lineHeight: 1.2,
          }}
        >
          {value}
        </span>
        {hint ? (
          <span
            className="truncate"
            style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}
          >
            {hint}
          </span>
        ) : null}
      </div>
      {action ? (
        <div className="shrink-0 flex items-center self-center">{action}</div>
      ) : null}
    </div>
  );
}
