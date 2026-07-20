"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Icon2FAFilled,
  IconBellFilled,
  IconDocumentosFilled,
  IconUserProfileFilled,
} from "@/components/dashboard/KpiIcons";
import type { ReactNode } from "react";

type ConfigItem = {
  href: string;
  title: string;
  description: string;
  disabled?: boolean;
  lucide?: LucideIcon;
  customIcon?: ReactNode;
};

const ITEMS: ConfigItem[] = [
  {
    href: "/configuracoes/perfil",
    title: "Meu perfil",
    description: "Nome, e-mail, telefone e dados da conta.",
    customIcon: <IconUserProfileFilled size={22} tone="white" />,
  },
  {
    href: "/configuracoes/documentos",
    title: "Meus documentos",
    description: "Envio e status de verificação de documentos.",
    customIcon: <IconDocumentosFilled size={22} tone="white" />,
  },
  {
    href: "/configuracoes/notificacoes",
    title: "Notificações",
    description:
      "Venda gerada e aprovada no celular (Android/iOS) e no computador (Mac/Windows).",
    customIcon: <IconBellFilled size={22} tone="white" />,
  },
  {
    href: "/configuracoes/seguranca",
    title: "Segurança",
    description: "Verificação em duas etapas (2FA) com app autenticador.",
    // Mesmo ícone da página Segurança (2FA / escudo)
    customIcon: <Icon2FAFilled size={22} tone="white" />,
  },
];

export default function ConfiguracoesPage() {
  return (
    <AppShell>
      <div className="flex flex-col" style={{ gap: 18, maxWidth: 720 }}>
        <div>
          <h1
            className="font-bold"
            style={{ fontSize: 22, color: "var(--text-1)" }}
          >
            Configurações
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-2)",
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            Gerencie sua conta, documentos e preferências.
          </p>
        </div>

        <div className="flex flex-col" style={{ gap: 12 }}>
          {ITEMS.map((item) => {
            const Icon = item.lucide;
            const disabled = Boolean(item.disabled);
            const body = (
              <>
                <span
                  className="flex shrink-0 items-center justify-center"
                  style={{
                    width: "var(--kpi-icon-size)",
                    height: "var(--kpi-icon-size)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-card-inner-icon)",
                    color: "var(--green-use)",
                  }}
                >
                  {item.customIcon ??
                    (Icon ? (
                      <Icon size={22} strokeWidth={1.75} />
                    ) : null)}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block font-semibold"
                    style={{ fontSize: 14, color: "var(--text-1)" }}
                  >
                    {item.title}
                  </span>
                  <span
                    className="block"
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-2)",
                      marginTop: 4,
                      lineHeight: 1.45,
                    }}
                  >
                    {item.description}
                  </span>
                </span>
              </>
            );

            if (disabled) {
              return (
                <div
                  key={item.title}
                  className="surface-card flex items-start gap-3.5"
                  style={{
                    padding: "16px 18px",
                    borderRadius: "var(--radius-card)",
                    opacity: 0.55,
                  }}
                >
                  {body}
                </div>
              );
            }

            return (
              <Link
                key={item.title}
                href={item.href}
                className="surface-card flex items-start gap-3.5 transition-opacity hover:opacity-95"
                style={{
                  padding: "16px 18px",
                  borderRadius: "var(--radius-card)",
                  textDecoration: "none",
                }}
              >
                {body}
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
