/**
 * KYC / liberação de conta seller.
 * Conta nova nasce "pendente" e só vira "ativo" após aprovação admin.
 */

import type { AuthKyc, AuthUser, SellerDocKind, UserStatus } from "@/lib/domain/types";

/** Quatro tipos exigidos para liberar o gateway (PF e PJ). */
export const REQUIRED_DOC_KINDS: readonly SellerDocKind[] = [
  "doc_frente",
  "doc_verso",
  "selfie",
  "contrato_social",
] as const;

export const DOC_KIND_LABELS: Record<SellerDocKind, string> = {
  doc_frente: "RG / documento (frente)",
  doc_verso: "RG / documento (verso)",
  selfie: "Selfie com documento",
  contrato_social: "Contrato social",
};

export function requiredDocCount(): number {
  return REQUIRED_DOC_KINDS.length;
}

export function buildKyc(
  status: UserStatus | string,
  docs: Array<{ kind: string; status: string }>
): AuthKyc {
  const required = REQUIRED_DOC_KINDS;
  const byKind = new Map(docs.map((d) => [d.kind, d]));
  let docsCount = 0;
  let hasRejected = false;
  for (const kind of required) {
    const d = byKind.get(kind);
    if (d) {
      docsCount += 1;
      if (d.status === "rejeitado") hasRejected = true;
    }
  }
  const docsSubmitted = docsCount >= required.length;
  const needsApproval = status !== "ativo";

  return {
    needsApproval,
    docsSubmitted,
    docsCount,
    requiredCount: required.length,
    hasRejected,
  };
}

/** Seller (não admin) com conta ainda não liberada. */
export function accountLocked(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (user.roles?.includes("admin")) return false;
  if (user.status === "ativo") return false;
  return true;
}

/**
 * Rotas liberadas enquanto a conta está pendente de aprovação.
 * Dashboard fica aberta (com faixa de aviso); demais páginas do gateway bloqueadas.
 */
export function isKycAllowedPath(pathname: string): boolean {
  if (!pathname) return false;
  // Dashboard seller aberta com banner de KYC
  if (pathname === "/" || pathname === "/dash") return true;
  if (pathname.startsWith("/configuracoes")) return true;
  if (pathname.startsWith("/docs")) return true;
  if (pathname.startsWith("/login")) return true;
  if (pathname.startsWith("/registro")) return true;
  if (pathname.startsWith("/esqueci-senha")) return true;
  if (pathname.startsWith("/redefinir-senha")) return true;
  return false;
}

/** Destino ao tentar acessar página bloqueada (conta pendente). */
export function kycBlockedRedirectPath(): string {
  return "/dash";
}
