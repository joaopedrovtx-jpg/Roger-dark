export type SaqueStatus = "pago" | "recusado" | "processando";

export interface SaqueTransaction {
  id: string;
  date: string; // ISO
  amount: number;
  method: string;
  destination: string;
  status: SaqueStatus;
}

export interface FinanceiroMetrics {
  totalIn: number;
  totalOut: number;
  balance: number;
  saquesCount: number;
  /** Saldo retido na conta */
  heldBalance: number;
}

export const financeiroMetricsMock: FinanceiroMetrics = {
  totalIn: 328_450.75,
  totalOut: 94_210.3,
  balance: 788_901.86,
  saquesCount: 18,
  heldBalance: 49_306.37,
};

export const saqueHistoryMock: SaqueTransaction[] = [
  {
    id: "SQ-10482",
    date: "2025-12-23T14:32:00",
    amount: 5_000.0,
    method: "PIX",
    destination: "•••.•••.890-12",
    status: "pago",
  },
  {
    id: "SQ-10471",
    date: "2025-12-22T09:15:00",
    amount: 12_450.5,
    method: "PIX",
    destination: "empresa@email.com",
    status: "pago",
  },
  {
    id: "SQ-10460",
    date: "2025-12-20T18:40:00",
    amount: 3_200.0,
    method: "PIX",
    destination: "(11) 9••••-4421",
    status: "processando",
  },
  {
    id: "SQ-10455",
    date: "2025-12-19T11:05:00",
    amount: 8_900.0,
    method: "PIX",
    destination: "•••.•••.890-12",
    status: "pago",
  },
  {
    id: "SQ-10440",
    date: "2025-12-17T16:22:00",
    amount: 1_500.0,
    method: "PIX",
    destination: "chave-aleatoria-****",
    status: "recusado",
  },
  {
    id: "SQ-10428",
    date: "2025-12-15T08:50:00",
    amount: 25_000.0,
    method: "PIX",
    destination: "empresa@email.com",
    status: "pago",
  },
  {
    id: "SQ-10412",
    date: "2025-12-12T13:10:00",
    amount: 4_320.8,
    method: "PIX",
    destination: "•••.•••.890-12",
    status: "processando",
  },
  {
    id: "SQ-10398",
    date: "2025-12-10T19:45:00",
    amount: 7_100.0,
    method: "PIX",
    destination: "(11) 9••••-4421",
    status: "pago",
  },
];
