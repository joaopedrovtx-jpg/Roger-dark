/**
 * Validação central de uploads de documentos KYC.
 * TextInput/UploadThing já limita tamanho no FileRouter; este service
 * centraliza regras de tipo/tamanho/quota por seller (limite por conta),
 * extensão MIME permitida e nomes amigáveis para erros.
 *
 * Pode ser usado tanto em API routes quanto em server actions.
 */

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import type { SellerDocKind } from "@/lib/domain/types";

export const DOC_KIND_LABELS: Record<SellerDocKind, string> = {
  selfie: "Selfie",
  doc_frente: "Documento (frente)",
  doc_verso: "Documento (verso)",
  contrato_social: "Contrato social",
};

export const REQUIRED_DOC_KINDS: SellerDocKind[] = [
  "selfie",
  "doc_frente",
  "doc_verso",
];

const ALLOWED_MIME: Record<SellerDocKind, string[]> = {
  selfie: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  doc_frente: ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"],
  doc_verso: ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"],
  contrato_social: ["application/pdf", "image/jpeg", "image/jpg", "image/png"],
};

const MAX_BYTES: Record<SellerDocKind, number> = {
  selfie: 4 * 1024 * 1024,
  doc_frente: 8 * 1024 * 1024,
  doc_verso: 8 * 1024 * 1024,
  contrato_social: 16 * 1024 * 1024,
};

/** Quantos documentos o seller pode enviar por janela de 24h (anti-abuso). */
export const DAILY_DOC_UPLOAD_LIMIT = 20;

export interface ValidationResult {
  ok: boolean;
  reason?: string;
  kind?: SellerDocKind;
  mime?: string;
  sizeBytes?: number;
}

export function isValidDocKind(kind: string): kind is SellerDocKind {
  return kind in DOC_KIND_LABELS;
}

export function validateDocumentUpload(input: {
  kind: string;
  mime: string;
  sizeBytes: number;
  fileName?: string;
}): ValidationResult {
  if (!isValidDocKind(input.kind)) {
    return { ok: false, reason: "Tipo de documento inválido" };
  }
  const allowed = ALLOWED_MIME[input.kind];
  if (!allowed.includes(input.mime.toLowerCase())) {
    return {
      ok: false,
      kind: input.kind,
      mime: input.mime,
      reason: `Formato ${input.mime} não aceito para ${DOC_KIND_LABELS[input.kind]}`,
    };
  }
  const max = MAX_BYTES[input.kind];
  if (input.sizeBytes > max) {
    const mb = Math.round((max / (1024 * 1024)) * 10) / 10;
    return {
      ok: false,
      kind: input.kind,
      sizeBytes: input.sizeBytes,
      reason: `Arquivo excede o limite de ${mb}MB para ${DOC_KIND_LABELS[input.kind]}`,
    };
  }
  return {
    ok: true,
    kind: input.kind,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
  };
}

export interface QuotaResult {
  ok: boolean;
  used: number;
  limit: number;
  remaining: number;
  reason?: string;
}

/** Conta uploads nas últimas 24h p/ cota do seller. */
export async function checkDocUploadQuota(
  userId: string,
  limit = DAILY_DOC_UPLOAD_LIMIT
): Promise<QuotaResult> {
  if (!isDatabaseConfigured()) {
    // Sem DB: confia no middleware UploadThing (tamanho por arquivo)
    return { ok: true, used: 0, limit, remaining: limit };
  }
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const used = await prisma.document.count({
      where: { userId, submittedAt: { gte: since } },
    });
    const remaining = Math.max(limit - used, 0);
    if (used >= limit) {
      return {
        ok: false,
        used,
        limit,
        remaining: 0,
        reason: `Limite de ${limit} envios/24h atingido`,
      };
    }
    return { ok: true, used, limit, remaining };
  } catch {
    return { ok: true, used: 0, limit, remaining: limit };
  }
}

export function humanizeDocSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round((bytes / 1024) * 10) / 10} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}