"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/query-client";
import type {
  ApiListParams,
  ApiListResult,
  Transaction,
} from "@/lib/domain/types";

interface TransactionsMetrics {
  pendentes: number;
  pagos: number;
  recusados: number;
  reembolsos: number;
  ticketMedio: number;
  taxaConversao: number;
}

interface TransactionsResponse extends ApiListResult<Transaction> {
  source?: string;
  metrics: TransactionsMetrics;
}

export interface TransactionsFilters extends ApiListParams {}

export function useTransactions(filters: TransactionsFilters = {}) {
  const { page = 1, pageSize = 15, search, status, period } = filters;
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (period) params.set("period", period);

  return useQuery<TransactionsResponse>({
    queryKey: ["transactions", page, pageSize, search ?? "", status ?? "", period ?? ""],
    queryFn: ({ signal }) =>
      apiGet<TransactionsResponse>(
        `/api/v1/transactions?${params.toString()}`,
        signal
      ),
    staleTime: 15 * 1000,
  });
}