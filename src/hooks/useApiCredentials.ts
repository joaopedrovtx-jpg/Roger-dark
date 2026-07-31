"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/query-client";

export interface ApiCredentialMeta {
  id: string;
  name?: string;
  env: string;
  publicKey: string;
  secretHint: string;
  permissions?: string[];
  requireManualSaqueApproval?: boolean;
  expiresAt?: string | null;
  createdAt?: string;
  lastUsedAt?: string | null;
}

export interface ApiCredentialsResponse {
  source?: string;
  items: ApiCredentialMeta[];
  total: number;
  format?: Record<string, string>;
}

export interface CreateApiCredentialInput {
  name?: string;
  permissions?: string[];
  requireManualSaqueApproval?: boolean;
  expiresAt?: string | null;
  env?: "live" | "test";
}

export interface CreatedApiCredential extends ApiCredentialMeta {
  secretKey?: string;
  warning?: string;
}

export function useApiCredentials() {
  return useQuery<ApiCredentialsResponse>({
    queryKey: ["api-credentials"],
    queryFn: ({ signal }) =>
      apiGet<ApiCredentialsResponse>("/api/v1/api-credentials", signal),
    staleTime: 60 * 1000,
  });
}

export function useCreateApiCredential() {
  const qc = useQueryClient();
  return useMutation<CreatedApiCredential, Error, CreateApiCredentialInput>({
    mutationFn: (input) =>
      apiPost<CreatedApiCredential, CreateApiCredentialInput>(
        "/api/v1/api-credentials",
        input
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-credentials"] });
    },
  });
}

export interface UpdateApiCredentialInput {
  name?: string;
  permissions?: string[];
  requireManualSaqueApproval?: boolean;
  expiresAt?: string | null;
  active?: boolean;
}

export function useUpdateApiCredential(id: string) {
  const qc = useQueryClient();
  return useMutation<ApiCredentialMeta, Error, UpdateApiCredentialInput>({
    mutationFn: (input) =>
      apiPatch<ApiCredentialMeta, UpdateApiCredentialInput>(
        `/api/v1/api-credentials/${id}`,
        input
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-credentials"] });
    },
  });
}

export function useRevealApiCredential(id: string) {
  return useMutation<
    { secretKey: string; warning?: string },
    Error,
    void
  >({
    mutationFn: () =>
      apiPost<{ secretKey: string; warning?: string }, { action: "reveal" }>(
        `/api/v1/api-credentials/${id}`,
        { action: "reveal" }
      ),
  });
}

export function useDeleteApiCredential() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (id) => apiDelete<{ ok: boolean }>(`/api/v1/api-credentials/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-credentials"] });
    },
  });
}