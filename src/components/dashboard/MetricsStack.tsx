import { KpiCard } from "./KpiCard";
import {
  IconTransferFilled,
  IconPercentFilled,
  IconOutflowFilled,
  IconRefundFilled,
} from "./KpiIcons";
import { formatBRL } from "@/lib/format";
import type { DashboardData } from "@/types/dashboard";

interface MetricsStackProps {
  data: DashboardData;
}

const ICON = 22;

/**
 * Lateral do gráfico (4 cards, mesmo tamanho, do topo à base):
 * Total de Transações | Ticket médio | Total de saídas | Reembolsos
 * Lucro líquido fica na linha de cima com os saldos.
 */
export function MetricsStack({ data }: MetricsStackProps) {
  const refunded = Number(data.balances.refunded) || 0;

  return (
    <div className="metrics-stack w-full h-full">
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
      <div className="metrics-stack__cell">
        <KpiCard
          fill
          icon={<IconRefundFilled size={ICON} />}
          label="Reembolsos"
          value={formatBRL(refunded)}
        />
      </div>
    </div>
  );
}
