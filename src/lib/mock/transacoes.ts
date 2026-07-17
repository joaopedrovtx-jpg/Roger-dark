export type VendaStatus =
  | "pendente"
  | "aprovada"
  | "recusada"
  | "reembolsada";

export interface VendaTransaction {
  id: string;
  date: string; // ISO
  customer: string;
  product: string;
  method: "PIX";
  amount: number;
  status: VendaStatus;
}

export interface TransacoesMetrics {
  /** Total em R$ de vendas pendentes */
  pendentes: number;
  /** Total em R$ de vendas pagas (status aprovada) */
  pagos: number;
  /** Total em R$ de vendas recusadas */
  recusados: number;
  /** Total em R$ de reembolsos */
  reembolsos: number;
  /** Ticket médio das vendas pagas (R$) */
  ticketMedio: number;
  /** Taxa de conversão 0–100 */
  taxaConversao: number;
}

export const transacoesMetricsMock: TransacoesMetrics = {
  pendentes: 3580.0,
  pagos: 58920.5,
  recusados: 2140.0,
  reembolsos: 980.0,
  ticketMedio: 397.54,
  taxaConversao: 85.5,
};

export const vendasHistoryMock: VendaTransaction[] = [
  {
    id: "TX-20941",
    date: "2025-12-23T16:45:00",
    customer: "Ana Souza",
    product: "Curso Digital Pro",
    method: "PIX",
    amount: 297.0,
    status: "aprovada",
  },
  {
    id: "TX-20938",
    date: "2025-12-23T15:12:00",
    customer: "Bruno Lima",
    product: "Mentoria 1:1",
    method: "PIX",
    amount: 890.0,
    status: "pendente",
  },
  {
    id: "TX-20930",
    date: "2025-12-23T11:08:00",
    customer: "Carla Mendes",
    product: "E-book Premium",
    method: "PIX",
    amount: 47.9,
    status: "aprovada",
  },
  {
    id: "TX-20922",
    date: "2025-12-22T21:33:00",
    customer: "Diego Alves",
    product: "Assinatura Mensal",
    method: "PIX",
    amount: 97.0,
    status: "recusada",
  },
  {
    id: "TX-20915",
    date: "2025-12-22T18:05:00",
    customer: "Elena Costa",
    product: "Pack Templates",
    method: "PIX",
    amount: 129.9,
    status: "aprovada",
  },
  {
    id: "TX-20901",
    date: "2025-12-22T09:40:00",
    customer: "Felipe Rocha",
    product: "Workshop Live",
    method: "PIX",
    amount: 197.0,
    status: "reembolsada",
  },
  {
    id: "TX-20888",
    date: "2025-12-21T14:22:00",
    customer: "Gabriela Nunes",
    product: "Curso Digital Pro",
    method: "PIX",
    amount: 297.0,
    status: "aprovada",
  },
  {
    id: "TX-20870",
    date: "2025-12-21T10:15:00",
    customer: "Hugo Martins",
    product: "Consultoria",
    method: "PIX",
    amount: 1_500.0,
    status: "pendente",
  },
  {
    id: "TX-20855",
    date: "2025-12-20T19:50:00",
    customer: "Isabela Freitas",
    product: "E-book Premium",
    method: "PIX",
    amount: 47.9,
    status: "recusada",
  },
  {
    id: "TX-20840",
    date: "2025-12-20T08:18:00",
    customer: "João Pedro",
    product: "Assinatura Anual",
    method: "PIX",
    amount: 897.0,
    status: "aprovada",
  },
  {
    id: "TX-20821",
    date: "2025-12-19T13:05:00",
    customer: "Karen Dias",
    product: "Pack Templates",
    method: "PIX",
    amount: 129.9,
    status: "reembolsada",
  },
  {
    id: "TX-20805",
    date: "2025-12-18T17:42:00",
    customer: "Lucas Ferreira",
    product: "Curso Digital Pro",
    method: "PIX",
    amount: 297.0,
    status: "aprovada",
  },
];
