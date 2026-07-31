"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/query-client";

export interface UtmifyConnection {
  connected: boolean;
  apiToken?: string | null;
  active?: boolean;
}

export interface UtmifyResponse {
  source?: string;
  platform?: string;
  docs?: string;
  howTo?: string;
  connection: UtmifyConnection;
}

export function useUtmifyIntegration() {
  return useQuery<UtmifyResponse>({
    queryKey: ["utmify"],
    queryFn: ({ signal }) =>
      apiGet<UtmifyResponse>("/api/v1/integrations/utmify", signal),
    staleTime: 30 * 1000,
  });
}

export function useSaveUtmifyToken() {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; connection?: UtmifyConnection },
    Error,
    string
  >({
    mutationFn: (token) =>
      apiPut<{ ok: boolean; connection?: UtmifyConnection }, { token: string }>(
        "/api/v1/integrations/utmify",
        { token }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["utmify"] });
    },
  });
}

export function useDisconnectUtmify() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, void>({
    mutationFn: () => apiDelete<{ ok: boolean }>("/api/v1/integrations/utmify"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["utmify"] });
    },
  });
}

export function useTestUtmify() {
  return useMutation<
    { ok: boolean; status?: number; error?: string },
    Error,
    string
  >({
    mutationFn: (token) =>
      apiPost<
        { ok: boolean; status?: number; error?: string },
        { action: string; token: string }
      >("/api/v1/integrations/utmify", { action: "test", token }),
  });
}