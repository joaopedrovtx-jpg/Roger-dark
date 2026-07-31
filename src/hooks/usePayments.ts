"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/query-client";

export interface PaymentChargeView {
  id: string;
  status: string;
  amount: number;
  currency?: string;
  method?: string;
  description?: string;
  customerName?: string;
  pix?: {
    qrCode?: string;
    copyPaste?: string;
  };
  expiresAt?: string;
  createdAt?: string;
  paidAt?: string | null;
  transactionId?: string;
  sellerId?: string;
  real?: boolean;
}

export interface CreatePixChargeInput {
  amount: number;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerDocument?: string;
  metadata?: Record<string, unknown>;
  orderRef?: string;
}

export function usePayments() {
  return useQuery<{ items: PaymentChargeView[]; total: number }>({
    queryKey: ["payments"],
    queryFn: ({ signal }) =>
      apiGet<{ items: PaymentChargeView[]; total: number }>(
        "/api/v1/payments",
        signal
      ),
    staleTime: 20 * 1000,
  });
}

export function usePayment(chargeId: string | null | undefined) {
  return useQuery<PaymentChargeView>({
    queryKey: ["payment", chargeId],
    queryFn: ({ signal }) =>
      apiGet<PaymentChargeView>(`/api/v1/payments/${chargeId}`, signal),
    enabled: Boolean(chargeId),
    staleTime: 10 * 1000,
  });
}

export function useCreatePixCharge() {
  const qc = useQueryClient();
  return useMutation<PaymentChargeView, Error, CreatePixChargeInput>({
    mutationFn: (input) =>
      apiPost<PaymentChargeView, CreatePixChargeInput>(
        "/api/v1/payments",
        input
      ),
    onSuccess: (charge) => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      if (charge?.id) {
        qc.invalidateQueries({ queryKey: ["payment", charge.id] });
      }
    },
  });
}

export function useSimulatePayment(chargeId: string) {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, void>({
    mutationFn: () =>
      apiPost<{ ok: boolean }, unknown>(
        `/api/v1/payments/${chargeId}/simulate-pay`,
        {}
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment", chargeId] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["seller-finance"] });
    },
  });
}

export function useSyncPayment(chargeId: string) {
  const qc = useQueryClient();
  return useMutation<PaymentChargeView, Error, void>({
    mutationFn: () =>
      apiPost<PaymentChargeView, unknown>(
        `/api/v1/payments/${chargeId}/sync`,
        {}
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment", chargeId] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function useReconcilePayments() {
  const qc = useQueryClient();
  return useMutation<
    { updated: number; expired: number },
    Error,
    void
  >({
    mutationFn: () =>
      apiPost<{ updated: number; expired: number }, unknown>(
        "/api/v1/payments/reconcile",
        {}
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["seller-finance"] });
    },
  });
}