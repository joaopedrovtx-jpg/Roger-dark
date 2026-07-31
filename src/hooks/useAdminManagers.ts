"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "@/lib/api/query-client";
import type { Manager } from "@/lib/domain/types";

export interface AdminManagersResponse {
  source?: string;
  items: Manager[];
  total: number;
}

export function useAdminManagers() {
  return useQuery<AdminManagersResponse>({
    queryKey: ["admin-managers"],
    queryFn: ({ signal }) =>
      apiGet<AdminManagersResponse>("/api/v1/admin/managers", signal),
    staleTime: 30 * 1000,
  });
}

export interface CreateManagerInput {
  userId: string;
  permissions?: string[];
}

export function useCreateManager() {
  const qc = useQueryClient();
  return useMutation<Manager & { source?: string }, Error, CreateManagerInput>({
    mutationFn: (input) =>
      apiPost<Manager & { source?: string }, CreateManagerInput>(
        "/api/v1/admin/managers",
        input
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-managers"] }),
  });
}

export interface UpdateManagerInput {
  id: string;
  status?: "ativo" | "inativo";
  permissions?: string[];
}

export function useUpdateManager() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; status?: string; source?: string },
    Error,
    UpdateManagerInput
  >({
    mutationFn: ({ id, ...data }) =>
      apiPatch<
        { id: string; status?: string; source?: string },
        Omit<UpdateManagerInput, "id">
      >(`/api/v1/admin/managers/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-managers"] }),
  });
}