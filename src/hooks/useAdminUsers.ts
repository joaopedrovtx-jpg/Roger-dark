"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api/query-client";
import type { AdminUser } from "@/lib/mock/admin";
import { setDocumentsStatusAction } from "@/lib/actions/admin/users.actions";
import {
  updateUserFeesAction,
  updateUserRoutingAction,
  updateUserStatusAction,
} from "@/lib/actions/admin/users.actions";
import type {
  DocReviewStatus,
  SellerFees,
  UserStatus,
} from "@/lib/domain/types";

export interface AdminUsersMetrics {
  total: number;
  ativo: number;
  pendente: number;
  bloqueado: number;
  hoje: number;
  novos: number;
}

export interface AdminUsersResponse {
  source?: string;
  metrics: AdminUsersMetrics;
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUsersFilters {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useAdminUsers(filters: AdminUsersFilters = {}) {
  const { page = 1, pageSize = 20, search, status } = filters;
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (search) params.set("search", search);
  if (status && status !== "todos") params.set("status", status);

  return useQuery<AdminUsersResponse>({
    queryKey: ["admin-users", page, pageSize, search ?? "", status ?? ""],
    queryFn: ({ signal }) =>
      apiGet<AdminUsersResponse>(
        `/api/v1/admin/users?${params.toString()}`,
        signal
      ),
    staleTime: 20 * 1000,
  });
}

export interface UserDocumentsResponse {
  id: string;
  documents: Array<{
    id: string;
    kind: string;
    typeLabel: string;
    status: DocReviewStatus;
    submittedAt: string;
    previewUrl?: string | null;
    notes?: string;
  }>;
  source?: string;
}

export function useAdminUserDocuments(userId: string | null | undefined) {
  return useQuery<UserDocumentsResponse>({
    queryKey: ["admin-user-documents", userId],
    queryFn: ({ signal }) =>
      apiGet<UserDocumentsResponse>(
        `/api/v1/admin/users/${userId}?include=documents`,
        signal
      ),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  });
}

function throwErrorIfAny(r: { error?: string }): void {
  if (r && typeof r === "object" && "error" in r && typeof r.error === "string") {
    throw new Error(r.error);
  }
}

export function useUpdateUserStatus() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; status: UserStatus; source?: string },
    Error,
    { userId: string; status: UserStatus }
  >({
    mutationFn: async ({ userId, status }) => {
      const r = await updateUserStatusAction(userId, status);
      throwErrorIfAny(r as { error?: string });
      const ok = r as { id: string; status: UserStatus; source: string };
      return { id: ok.id, status: ok.status, source: ok.source };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      if (vars.userId)
        qc.invalidateQueries({ queryKey: ["admin-user-documents", vars.userId] });
    },
  });
}

export function useUpdateUserFees() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; fees: SellerFees; source?: string },
    Error,
    { userId: string; fees: SellerFees }
  >({
    mutationFn: async ({ userId, fees }) => {
      const r = await updateUserFeesAction(userId, fees);
      throwErrorIfAny(r as { error?: string });
      const ok = r as { id: string; fees: SellerFees; source: string };
      return { id: ok.id, fees: ok.fees, source: ok.source };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

export interface AdminUpdateRoutingInput {
  saqueAutomatico?: boolean;
  routingMode?: string;
  preferredAdquirenteId?: string | null;
  adquirenteIds?: string[];
}

export function useUpdateUserRouting() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; source?: string } & AdminUpdateRoutingInput,
    Error,
    { userId: string; data: AdminUpdateRoutingInput }
  >({
    mutationFn: async ({ userId, data }) => {
      const r = await updateUserRoutingAction(userId, data);
      throwErrorIfAny(r as { error?: string });
      const ok = r as AdminUpdateRoutingInput & {
        id: string;
        source: string;
      };
      return { ...data, ...ok };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

export function useSetUserDocumentsStatus() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; source?: string },
    Error,
    { userId: string; status: DocReviewStatus }
  >({
    mutationFn: async ({ userId, status }) => {
      const r = await setDocumentsStatusAction(userId, status);
      throwErrorIfAny(r as { error?: string });
      const ok = r as { ok: boolean; source: string };
      return { ok: ok.ok, source: ok.source };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-user-documents", vars.userId] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
}

/** Patch direto via API (legacy compat p/ AdminUserDetailModal). */
export function useAdminPatchUser(id: string) {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, Record<string, unknown>>({
    mutationFn: (input) =>
      apiPatch<{ ok: boolean }, Record<string, unknown>>(
        `/api/v1/admin/users/${id}`,
        input
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-user-documents", id] });
    },
  });
}