import type { ReactNode } from "react";

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Ação à direita (ex.: Sacar) */
  action?: ReactNode;
  /**
   * Reserva a faixa da ação nos 3 saldos (mesma largura interna).
   */
  reserveAction?: boolean;
  /**
   * Preenche a célula (métricas laterais alinhadas à altura do gráfico).
   */
  fill?: boolean;
}

/**
 * Card de indicador unificado.
 * - Saldos: altura fixa --kpi-card-height, 3 colunas iguais
 * - Lateral do gráfico: fill = divide a altura do gráfico em 4 partes iguais
 */
export function KpiCard({
  icon,
  label,
  value,
  action,
  reserveAction = false,
  fill = false,
}: KpiCardProps) {
  const showActionRail = Boolean(action) || reserveAction;

  return (
    <div
      className={`surface-card kpi-card flex items-center w-full min-w-0 ${
        fill ? "kpi-card--fill" : ""
      }`}
      style={{
        gap: 12,
        padding: fill ? "0 14px" : "0 16px",
        height: fill ? "100%" : "var(--kpi-card-height)",
        minHeight: fill ? 0 : "var(--kpi-card-height)",
        maxHeight: fill ? "none" : "var(--kpi-card-height)",
        borderRadius: "var(--radius-card)",
        boxSizing: "border-box",
        width: "100%",
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

      <div
        className="min-w-0 flex-1 flex flex-col justify-center"
        style={{ gap: 2 }}
      >
        <span
          className="truncate"
          style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 400 }}
        >
          {label}
        </span>
        <span
          className="tabular truncate font-bold"
          style={{ fontSize: fill ? 15.5 : 16, color: "var(--text-1)", lineHeight: 1.15 }}
        >
          {value}
        </span>
      </div>

      {showActionRail ? (
        <div
          className="shrink-0 flex items-center self-center justify-end"
          style={{
            width: "var(--kpi-action-width)",
            minWidth: "var(--kpi-action-width)",
            minHeight: 32,
          }}
        >
          {action ?? null}
        </div>
      ) : null}
    </div>
  );
}
