import type { DashboardData } from "@/types/dashboard";

/** Mock congelado da SPEC valores da imagem de referência */
export const dashboardMock: DashboardData = {
  user: {
    name: "Igor Rocha",
    avatarUrl: null,
  },
  volume: {
    current: 880_900,
    goal: 950_000,
  },
  balances: {
    available: 788_901.86,
    pending: 197_225.46,
    held: 49_306.37,
  },
  metrics: {
    netProfit: 116_357.47,
    totalTransactions: 162,
    averageTicket: 397.54,
    totalOutflows: 42_850.0,
  },
  conversion: {
    pix: 90,
    boleto: 90,
    card: 90,
  },
  // Ordem L→R igual à imagem (23/12 → 14/12)
  revenueHistory: [
    { date: "2025-12-23", amount: 6360 },
    { date: "2025-12-22", amount: 7100 },
    { date: "2025-12-21", amount: 6160 },
    { date: "2025-12-20", amount: 7080 },
    { date: "2025-12-19", amount: 7260 },
    { date: "2025-12-18", amount: 6460 },
    { date: "2025-12-17", amount: 6280 },
    { date: "2025-12-16", amount: 6840 },
    { date: "2025-12-15", amount: 6250 },
    { date: "2025-12-14", amount: 6430 },
  ],
};
