"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api/query-client";
import type { SaqueStatus, Withdrawal } from "@/lib/domain/types";

export interface AdminWithdrawalItem extends Withdrawal {
  feeAmount?: number;
}

export interface AdminWithdrawalsMetrics {
  total: number;
  processando: number;
  pago: number;
  recusado: number;
  valorTotal: number;
  pendenteValor: number;
}

export interface AdminWithdrawalsResponse {
  source?: string;
  metrics?: AdminWithdrawalsMetrics;
  items: AdminWithdrawalItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function useAdminWithdrawals(
  filters: { status?: string; page?: number; pageSize?: number } = {}
) {
  const { status, page = 1, pageSize = 50 } = filters;
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (status) params.set("status", status);

  return useQuery<AdminWithdrawalsResponse>({
    queryKey: ["admin-withdrawals", status ?? "", page, pageSize],
    queryFn: ({ signal }) =>
      apiGet<AdminWithdrawalsResponse>(
        `/api/v1/admin/withdrawals?${params.toString()}`,
        signal
      ),
    staleTime: 15 * 1000,
  });
}

// /api/v1/admin/saques espelha withdrawals (mock-friendly)
export function useAdminSaques(
  filters: { status?: string; page?: number; pageSize?: number } = {}
) {
  const { status, page = 1, pageSize = 50 } = filters;
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (status) params.set("status", status);

  return useQuery<Omit<AdminWithdrawalsResponse, "items"> & { items: Withdrawal[] }>({
    queryKey: ["admin-saques", status ?? "", page, pageSize],
    queryFn: ({ signal }) =>
      apiGet<AdminWithdrawalsResponse>(
        `/api/v1/admin/saques?${params.toString()}`,
        signal
      ),
    staleTime: 15 * 1000,
  });
}

export interface SetWithdrawalStatusInput {
  id: string;
  status: "pago" | "recusado";
  manual?: boolean;
}

export function useSetWithdrawalStatus() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; status: SaqueStatus; source?: string },
    Error,
    SetWithdrawalStatusInput
  >({
    mutationFn: ({ id, status, manual }) =>
      apiPatch<
        { id: string; status: SaqueStatus; source?: string },
        { status: "pago" | "recusado"; manual?: boolean }
      >(`/api/v1/admin/withdrawals/${id}`, { status, manual }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      qc.invalidateQueries({ queryKey: ["admin-saques"] });
    },
  });
}