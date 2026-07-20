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

const ICON = 24;
const ICON_TX = 28;
const ICON_TICKET = 24;

/**
 * Cards à direita do gráfico empilhados e alinhados
 */
export function MetricsStack({ data }: MetricsStackProps) {
  return (
    <div
      className="grid w-full h-full"
      style={{
        height: 360,
        gridTemplateRows: "1fr 1fr 1fr 1fr",
        gap: "var(--kpi-gap)",
        alignItems: "stretch",
      }}
    >
      <div className="min-h-0 min-w-0">
        <KpiCard
          fill
          icon={<IconMoneyFlying size={ICON} />}
          label="Lucro líquido"
          value={formatBRL(data.metrics.netProfit)}
        />
      </div>
      <div className="min-h-0 min-w-0">
        <KpiCard
          fill
          icon={<IconTransferFilled size={ICON_TX} />}
          label="Total de Transações"
          value={String(data.metrics.totalTransactions)}
        />
      </div>
      <div className="min-h-0 min-w-0">
        <KpiCard
          fill
          icon={<IconPercentFilled size={ICON_TICKET} />}
          label="Ticket médio"
          value={formatBRL(data.metrics.averageTicket)}
        />
      </div>
      <div className="min-h-0 min-w-0">
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
