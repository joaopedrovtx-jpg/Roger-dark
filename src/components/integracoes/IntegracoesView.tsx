"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
interface IntegrationCardProps {
  title: string;
  description: ReactNode;
  /** Ícone dentro do quadrado (opcional se usar logoBg) */
  logo?: ReactNode;
  /** Imagem como fundo do quadrado (sem ícone por cima) */
  logoBg?: string;
  href?: string;
  disabled?: boolean;
  /** Tamanho do bloco do ícone (padrão 56) */
  iconSize?: number;
}

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: 16,
  padding: "18px 18px",
  borderRadius: "var(--radius-card)",
  border: "1px solid var(--border-card)",
  background: "var(--bg-card)",
  textDecoration: "none",
  width: "100%",
  minHeight: 104,
  boxSizing: "border-box",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

function IntegrationCard({
  title,
  description,
  logo,
  logoBg,
  href,
  disabled,
  iconSize = 56,
}: IntegrationCardProps) {
  const content = (
    <>
      {/* Quadrado do logo — imagem como fundo ou ícone */}
      <span
        className="flex shrink-0 items-center justify-center overflow-hidden"
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: "var(--radius-sm)",
          background: logoBg
            ? undefined
            : "var(--bg-card-inner-icon)",
          backgroundImage: logoBg ? `url(${logoBg})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          color: "var(--green-use)",
        }}
        aria-hidden
      >
        {logoBg ? null : logo}
      </span>

      {/* Textos à direita do ícone */}
      <span className="min-w-0 flex flex-col gap-1.5 flex-1 text-left">
        <span
          className="font-semibold truncate"
          style={{ fontSize: 15, color: "var(--text-1)", lineHeight: 1.25 }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: 13,
            lineHeight: 1.4,
            color: "var(--text-2)",
          }}
        >
          {description}
        </span>
      </span>
    </>
  );

  const style: CSSProperties = {
    ...cardStyle,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "default" : "pointer",
  };

  if (href && !disabled) {
    return (
      <Link
        href={href}
        className="surface-card text-left"
        style={style}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-card-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--bg-card)";
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="surface-card text-left" style={style}>
      {content}
    </div>
  );
}

export function IntegracoesView() {
  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
        }}
      >
        <IntegrationCard
          title="API"
          iconSize={64}
          description={
            <>
              Credenciais pk_/sk_ para integrar
              <br />
              cassino, checkout e backend
            </>
          }
          logoBg="/icons/api-logo.jpg"
          href="/integracoes/api"
        />
        <IntegrationCard
          title="Pagamentos PIX"
          iconSize={64}
          description={
            <>
              Playground: criar cobrança e
              <br />
              QR Code na sua conta
            </>
          }
          logoBg="/icons/pix.png"
          href="/integracoes/pagamentos"
        />
        <IntegrationCard
          title="UTMify"
          iconSize={64}
          description={
            <>
              Automatize o rastreamento de
              <br />
              campanhas e UTMs
            </>
          }
          logoBg="/icons/utmify-favicon.png"
          href="/integracoes/utmify"
        />
        <IntegrationCard
          title="Webhook"
          iconSize={64}
          description={
            <>
              Receba eventos de pagamento
              <br />
              em tempo real na sua URL
            </>
          }
          logoBg="/icons/webhook-logo.webp"
          href="/integracoes/webhooks"
        />
      </div>
    </div>
  );
}
