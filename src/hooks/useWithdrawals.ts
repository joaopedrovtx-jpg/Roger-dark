"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/query-client";
import type { CreateWithdrawalInput, Withdrawal } from "@/lib/domain/types";

export interface WithdrawalsResponse {
  source?: string;
  items: Withdrawal[];
  total: number;
}

export function useWithdrawals(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return useQuery<WithdrawalsResponse>({
    queryKey: ["withdrawals", status ?? ""],
    queryFn: ({ signal }) =>
      apiGet<WithdrawalsResponse>(`/api/v1/withdrawals${qs}`, signal),
    staleTime: 20 * 1000,
  });
}

export interface CreateWithdrawalResponse {
  source?: string;
  id: string;
  amount: number;
  status: string;
  date?: string;
}

export function useCreateWithdrawal() {
  const qc = useQueryClient();
  return useMutation<CreateWithdrawalResponse, Error, CreateWithdrawalInput>({
    mutationFn: (input) =>
      apiPost<CreateWithdrawalResponse, CreateWithdrawalInput>(
        "/api/v1/withdrawals",
        input
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["withdrawals"] });
      qc.invalidateQueries({ queryKey: ["seller-finance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}