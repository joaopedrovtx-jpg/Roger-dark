"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/query-client";
import type { DocReviewStatus, SellerDocKind } from "@/lib/domain/types";

export interface DocumentItem {
  id: string;
  kind: SellerDocKind;
  typeLabel: string;
  status: DocReviewStatus;
  submittedAt: string;
  previewUrl?: string | null;
  notes?: string;
}

export interface RequiredDoc {
  kind: SellerDocKind;
  typeLabel: string;
}

export interface KycInfo {
  needsApproval: boolean;
  docsSubmitted: boolean;
  docsCount: number;
  requiredCount: number;
  hasRejected: boolean;
}

export interface DocumentsResponse {
  documents: DocumentItem[];
  required: RequiredDoc[];
  kyc: KycInfo;
  accountStatus: string;
}

export function useDocuments() {
  return useQuery<DocumentsResponse>({
    queryKey: ["documents"],
    queryFn: ({ signal }) =>
      apiGet<DocumentsResponse>("/api/v1/documents", signal),
    staleTime: 60 * 1000,
  });
}