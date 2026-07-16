export interface MoneyFields {
  available: number;
  pending: number;
  held: number;
}

export interface Metrics {
  netProfit: number;
  totalTransactions: number;
  averageTicket: number;
  /** Total de saídas (saques / saídas do período) */
  totalOutflows: number;
}

export interface Conversion {
  pix: number;
  boleto: number;
  card: number;
}

export interface RevenuePoint {
  /** ISO date (YYYY-MM-DD) ou datetime (YYYY-MM-DDTHH:mm) */
  date: string;
  amount: number;
  /** "hour" = eixo por hora (hoje/ontem); "day" = por dia */
  grain?: "hour" | "day";
}

export interface DashboardData {
  user: {
    name: string;
    avatarUrl: string | null;
  };
  volume: {
    current: number;
    goal: number;
  };
  balances: MoneyFields;
  metrics: Metrics;
  conversion: Conversion;
  revenueHistory: RevenuePoint[];
}
