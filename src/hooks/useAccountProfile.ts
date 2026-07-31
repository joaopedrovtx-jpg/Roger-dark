"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/lib/api/query-client";
import { useAuth } from "@/components/auth/AuthProvider";

export interface AccountProfile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  document?: string | null;
  personType: "pf" | "pj";
  company?: string | null;
  cnpj?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  status: string;
  roles: string[];
}

export interface UpdateProfileInput {
  personType?: "pf" | "pj";
  name?: string;
  phone?: string;
  document?: string;
  company?: string;
  cnpj?: string;
  displayName?: string;
  avatarUrl?: string | null;
  representativeDocument?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  motherName?: string;
  birthDate?: string;
  neighborhood?: string;
  country?: string;
  international?: boolean;
  profileOnly?: boolean;
}

export function useAccountProfile() {
  return useQuery<AccountProfile>({
    queryKey: ["account-profile"],
    queryFn: ({ signal }) =>
      apiGet<AccountProfile>("/api/v1/account/profile", signal),
    staleTime: 60 * 1000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { refresh } = useAuth();
  return useMutation<AccountProfile, Error, UpdateProfileInput>({
    mutationFn: (input) =>
      apiPatch<AccountProfile, UpdateProfileInput>(
        "/api/v1/account/profile",
        input
      ),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["account-profile"] });
      // Sincroniza AuthProvider (displayName/avatar/status em /auth/me)
      void refresh();
    },
  });
}