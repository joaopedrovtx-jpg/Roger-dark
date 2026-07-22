import { KpiCard } from "./KpiCard";
import {
  IconMoneyFlying,
  IconTransferFilled,
  IconPercentFilled,
  IconOutflowFilled,
} from "./KpiIcons";
import { formatBRL } from "@/lib/format";
import type { DashboardData } from "@/types/dashboard";

interface MetricsStackProps {
  data: DashboardData;
}

const ICON = 22;

/**
 * 4 indicadores laterais do gráfico.
 * fill: dividem a altura do gráfico em 4 partes iguais
 * (topo alinhado ao topo do gráfico, base alinhada à base).
 */
export function MetricsStack({ data }: MetricsStackProps) {
  return (
    <div className="metrics-stack w-full h-full">
      <div className="metrics-stack__cell">
        <KpiCard
          fill
          icon={<IconMoneyFlying size={ICON} />}
          label="Lucro líquido"
          value={formatBRL(data.metrics.netProfit)}
        />
      </div>
      <div className="metrics-stack__cell">
        <KpiCard
          fill
          icon={<IconTransferFilled size={ICON} />}
          label="Total de Transações"
          value={String(data.metrics.totalTransactions)}
        />
      </div>
      <div className="metrics-stack__cell">
        <KpiCard
          fill
          icon={<IconPercentFilled size={ICON} />}
          label="Ticket médio"
          value={formatBRL(data.metrics.averageTicket)}
        />
      </div>
      <div className="metrics-stack__cell">
        <KpiCard
          fill
          icon={<IconOutflowFilled size={ICON} />}
          label="Total de saídas"
          value={formatBRL(data.metrics.totalOutflows)}
        />
      </div>
    </div>
  );
}
