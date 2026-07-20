"use client";

import Link from "next/link";
import { IconClockFilled } from "@/components/dashboard/KpiIcons";
import { useAuth } from "@/components/auth/AuthProvider";
import { accountLocked } from "@/lib/kyc";
import { isImpersonating } from "@/lib/client/impersonate";

/**
 * Faixa amarela fixa de aviso no topo (dashboard e páginas liberadas):
 * conta precisa de aprovação / envio de documentos. Botão preto.
 */
export function AccountPendingBanner() {
  const { user, loading, isAdmin } = useAuth();

  // Staff em visualização ou admin: não mostrar banner KYC do staff
  if (loading || isAdmin || isImpersonating()) return null;
  if (!accountLocked(user)) return null;

  const docsSubmitted = Boolean(user?.kyc?.docsSubmitted);
  const hasRejected = Boolean(user?.kyc?.hasRejected);

  // Depois que os docs vão para análise, a faixa some
  if (docsSubmitted && !hasRejected) return null;

  let title: string;
  let subtitle: string;
  let cta: string;

  if (hasRejected) {
    title = "Documentos rejeitados";
    subtitle =
      "Alguns documentos foram recusados. Reenvie os arquivos corretos para análise.";
    cta = "Reenviar documentos";
  } else {
    title = "Conta aguardando aprovação";
    subtitle =
      "Envie RG (frente e verso), selfie e contrato social para liberar o gateway.";
    cta = "Enviar documentos";
  }

  return (
    <div
      role="status"
      className="flex items-center gap-3 w-full"
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        background: "#eab308",
        border: "1px solid #ca8a04",
        marginBottom: 14,
      }}
    >
      <span
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 40,
          height: 40,
          borderRadius: "var(--radius-sm)",
          // Mesma estética do badge de “Saldo pendente” (KPI)
          background: "var(--bg-card-inner-icon)",
        }}
        aria-hidden
      >
        <IconClockFilled size={22} color="#eab308" />
      </span>

      <div className="min-w-0 flex-1">
        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            fontWeight: 700,
            color: "#0a0f0c",
            lineHeight: 1.3,
          }}
        >
          {title}
        </p>
        <p
          style={{
            margin: "3px 0 0",
            fontSize: 12.5,
            fontWeight: 650,
            color: "#0a0f0c",
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </p>
      </div>

      <Link
        href="/configuracoes/documentos"
        className="shrink-0 font-semibold"
        style={{
          height: 36,
          padding: "0 16px",
          borderRadius: "var(--radius-md)",
          // Mesma cor do fundo do badge do relógio (pendente)
          background: "var(--bg-card-inner-icon)",
          color: "#ffffff",
          fontSize: 13,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          textDecoration: "none",
          border: "none",
          whiteSpace: "nowrap",
        }}
      >
        {cta}
      </Link>
    </div>
  );
}
