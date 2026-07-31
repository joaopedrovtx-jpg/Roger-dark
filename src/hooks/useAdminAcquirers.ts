"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api/query-client";
import type { Acquirer, AdquirenteStatus } from "@/lib/domain/types";
import {
  clearAcquirerCredentialsAction,
  clearAcquirerPayoutPrimaryAction,
  saveAcquirerCredentialsAction,
  setAcquirerPayoutPrimaryAction,
  setAcquirerPrimaryAction,
  swapAcquirerPriorityAction,
  updateAcquirerStatusAction,
} from "@/lib/actions/admin/acquirers.actions";

export interface AdminAcquirersMetrics {
  volume: number;
  txs: number;
  total: number;
  ativos: number;
  manutencao: number;
  inativos: number;
  taxasPagas: number;
  ticketMedio: number;
}

export interface AdminAcquirersResponse {
  source?: string;
  metrics: AdminAcquirersMetrics;
  items: Acquirer[];
  total: number;
}

export function useAdminAcquirers() {
  return useQuery<AdminAcquirersResponse>({
    queryKey: ["admin-acquirers"],
    queryFn: ({ signal }) =>
      apiGet<AdminAcquirersResponse>("/api/v1/admin/acquirers", signal),
    staleTime: 30 * 1000,
  });
}

function throwErrorIfAny(r: { error?: string }): void {
  if (r && typeof r === "object" && "error" in r && typeof r.error === "string") {
    throw new Error(r.error);
  }
}

export function useUpdateAcquirerStatus() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; status: AdquirenteStatus; source?: string },
    Error,
    { id: string; status: AdquirenteStatus }
  >({
    mutationFn: async ({ id, status }) => {
      const r = await updateAcquirerStatusAction(id, status);
      throwErrorIfAny(r as { error?: string });
      const ok = r as { id: string; status: AdquirenteStatus; source: string };
      return { id: ok.id, status: ok.status, source: ok.source };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-acquirers"] }),
  });
}

export function useSwapAcquirerPriority() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; source?: string },
    Error,
    { id: string; dir: -1 | 1 }
  >({
    mutationFn: async ({ id, dir }) => {
      const r = await swapAcquirerPriorityAction(id, dir);
      throwErrorIfAny(r as { error?: string });
      const ok = r as { ok: boolean; source: string };
      return { ok: ok.ok, source: ok.source };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-acquirers"] }),
  });
}

export function useSetAcquirerPrimary() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; source?: string; isPrimary?: boolean },
    Error,
    string
  >({
    mutationFn: async (id) => {
      const r = await setAcquirerPrimaryAction(id);
      throwErrorIfAny(r as { error?: string });
      const ok = r as { ok: boolean; source: string; isPrimary: boolean };
      return { ok: ok.ok, source: ok.source, isPrimary: ok.isPrimary };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-acquirers"] }),
  });
}

export function useSetAcquirerPayoutPrimary() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; source?: string; isPayoutPrimary?: boolean; id?: string },
    Error,
    string
  >({
    mutationFn: async (id) => {
      const r = await setAcquirerPayoutPrimaryAction(id);
      throwErrorIfAny(r as { error?: string });
      const ok = r as {
        ok: boolean;
        source: string;
        isPayoutPrimary: boolean;
        id: string;
      };
      return {
        ok: ok.ok,
        source: ok.source,
        isPayoutPrimary: ok.isPayoutPrimary,
        id: ok.id,
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-acquirers"] }),
  });
}

export function useClearAcquirerPayoutPrimary() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; source?: string; isPayoutPrimary?: boolean; id?: string },
    Error,
    string
  >({
    mutationFn: async (id) => {
      const r = await clearAcquirerPayoutPrimaryAction(id);
      throwErrorIfAny(r as { error?: string });
      const ok = r as {
        ok: boolean;
        source: string;
        isPayoutPrimary: boolean;
        id: string;
      };
      return {
        ok: ok.ok,
        source: ok.source,
        isPayoutPrimary: ok.isPayoutPrimary,
        id: ok.id,
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-acquirers"] }),
  });
}

export interface SaveAcquirerCredentialsInput {
  id: string;
  publicKey?: string;
  privateKey?: string;
  env?: string;
  setPrimary?: boolean;
}

export function useSaveAcquirerCredentials() {
  const qc = useQueryClient();
  return useMutation<
    {
      id?: string;
      source?: string;
      saved?: boolean;
      hasPrivateKey?: boolean;
      hasPublicKey?: boolean;
      env?: string;
      isPrimary?: boolean;
      error?: string;
    },
    Error,
    SaveAcquirerCredentialsInput
  >({
    mutationFn: ({ id, ...data }) => saveAcquirerCredentialsAction(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-acquirers"] }),
  });
}

export function useClearAcquirerCredentials() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; source?: string }, Error, string>({
    mutationFn: async (id) => {
      const r = await clearAcquirerCredentialsAction(id);
      throwErrorIfAny(r as { error?: string });
      const ok = r as { ok: boolean; source: string };
      return { ok: ok.ok, source: ok.source };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-acquirers"] }),
  });
}

export interface UpdateAcquirerInput {
  id: string;
  status?: AdquirenteStatus;
  priority?: number;
}

/** Patch direto via API (compat direta com AdminAdquirenteDetailModal). */
export function useAdminPatchAcquirer(id: string) {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, Partial<UpdateAcquirerInput>>({
    mutationFn: (input) =>
      apiPatch<{ ok: boolean }, Partial<UpdateAcquirerInput>>(
        `/api/v1/admin/acquirers/${id}`,
        input
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-acquirers"] }),
  });
}