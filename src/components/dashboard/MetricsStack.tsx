import { KpiCard } from "./KpiCard";
import {
  IconMoneyFlying,
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
 * Indicadores laterais do gráfico (mesmo tamanho e alinhados ao gráfico).
 * fill: dividem a altura do gráfico em partes iguais.
 */
export function MetricsStack({ data }: MetricsStackProps) {
  const refunded = Number(data.balances.refunded) || 0;

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
