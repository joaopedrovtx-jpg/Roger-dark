"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/query-client";
import type { PeriodKey, SellerDashboard } from "@/lib/domain/types";

export interface DashboardResponse extends SellerDashboard {
  source?: string;
  viewOnly?: boolean;
}

export function useDashboard(period: PeriodKey = "7d") {
  return useQuery<DashboardResponse>({
    queryKey: ["dashboard", period],
    queryFn: ({ signal }) =>
      apiGet<DashboardResponse>(`/api/v1/dashboard?period=${period}`, signal),
    staleTime: 30 * 1000,
  });
}