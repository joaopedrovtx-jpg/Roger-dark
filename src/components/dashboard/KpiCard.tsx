import type { ReactNode } from "react";

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Ação à direita, centralizada verticalmente (ex.: Sacar) */
  action?: ReactNode;
  /** Preenche a altura do container (stack alinhado) */
  fill?: boolean;
}

export function KpiCard({
  icon,
  label,
  value,
  action,
  fill = false,
}: KpiCardProps) {
  return (
    <div
      className="surface-card flex items-center gap-3.5 w-full"
      style={{
        padding: "16px 18px",
        height: fill ? "100%" : 88,
        minHeight: fill ? 0 : 88,
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
          style={{ fontSize: 18, color: "var(--text-1)", lineHeight: 1.2 }}
        >
          {value}
        </span>
      </div>
      {action ? (
        <div className="shrink-0 flex items-center self-center">{action}</div>
      ) : null}
    </div>
  );
}
