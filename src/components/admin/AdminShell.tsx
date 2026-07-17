"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";
import { UserMenu } from "@/components/layout/UserMenu";
import { useAuth } from "@/components/auth/AuthProvider";

interface AdminShellProps {
  children: React.ReactNode;
  title?: string;
}

export function AdminShell({ children, title }: AdminShellProps) {
  const { user, loading } = useAuth();
  const displayName = user?.name ?? (loading ? "…" : "Admin");
  const avatarUrl = user?.avatarUrl ?? null;
  const mustSetup2fa = !!user?.mustSetup2fa;

  return (
    <div
      className="min-h-screen grid"
      style={{
        gridTemplateColumns: "var(--sidebar-width) 1fr",
        gridTemplateRows: "1fr",
        background: "var(--bg-app)",
      }}
    >
      <div style={{ gridColumn: 1, gridRow: 1 }}>
        <AdminSidebar />
      </div>
      <main
        className="min-w-0"
        style={{
          gridColumn: 2,
          gridRow: 1,
          padding: "14px 20px 24px 12px",
        }}
      >
        {mustSetup2fa ? (
          <div
            className="flex items-start gap-3 mb-4"
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(248, 113, 113, 0.12)",
              border: "1px solid rgba(248, 113, 113, 0.35)",
              color: "var(--text-1)",
            }}
          >
            <ShieldAlert
              size={20}
              strokeWidth={1.8}
              style={{ color: "#f87171", flexShrink: 0, marginTop: 2 }}
            />
            <div style={{ fontSize: 13, lineHeight: 1.45 }}>
              <strong style={{ display: "block", marginBottom: 4 }}>
                2FA obrigatório para administradores
              </strong>
              Ative a verificação em duas etapas para usar o painel admin.
              As APIs administrativas ficam bloqueadas até o setup.
              <div style={{ marginTop: 8 }}>
                <Link
                  href="/configuracoes/seguranca"
                  style={{
                    color: "#fca5a5",
                    fontWeight: 600,
                    textDecoration: "underline",
                  }}
                >
                  Ir para Segurança →
                </Link>
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-4 mb-4">
          {title ? (
            <h1
              className="font-bold"
              style={{ fontSize: 24, color: "var(--text-1)" }}
            >
              {title}
            </h1>
          ) : (
            <div />
          )}
          <UserMenu name={displayName} avatarUrl={avatarUrl} />
        </div>
        {children}
      </main>
    </div>
  );
}
