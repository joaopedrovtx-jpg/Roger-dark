"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/query-client";
import type { Balances, SellerFees, Withdrawal } from "@/lib/domain/types";

export interface SellerFinanceResponse {
  source?: string;
  viewOnly?: boolean;
  balances: Balances;
  withdrawals: Withdrawal[];
  totalPaid: number;
  fees?: SellerFees;
}

export function useSellerFinance() {
  return useQuery<SellerFinanceResponse>({
    queryKey: ["seller-finance"],
    queryFn: ({ signal }) =>
      apiGet<SellerFinanceResponse>("/api/v1/finance", signal),
    staleTime: 20 * 1000,
  });
}