"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/query-client";
import type { AdminMetrics, PeriodKey, Transaction } from "@/lib/domain/types";

export interface VolumePoint {
  date: string;
  amount: number;
  grain?: "hour" | "day";
}

export interface AdminDashboardResponse {
  source?: string;
  period: PeriodKey;
  metrics: AdminMetrics;
  volumeHistory: VolumePoint[];
  ledger: Transaction[];
}

export function useAdminDashboard(period: PeriodKey = "7d") {
  return useQuery<AdminDashboardResponse>({
    queryKey: ["admin-dashboard", period],
    queryFn: ({ signal }) =>
      apiGet<AdminDashboardResponse>(
        `/api/v1/admin/dashboard?period=${period}`,
        signal
      ),
    staleTime: 30 * 1000,
  });
}

export function useAdminMetrics(period: PeriodKey = "7d") {
  return useQuery<AdminMetrics & { source?: string; period: PeriodKey }>({
    queryKey: ["admin-metrics", period],
    queryFn: ({ signal }) =>
      apiGet<AdminMetrics & { source?: string; period: PeriodKey }>(
        `/api/v1/admin/metrics?period=${period}`,
        signal
      ),
    staleTime: 30 * 1000,
  });
}