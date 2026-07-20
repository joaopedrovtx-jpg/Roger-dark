"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { AdminShell } from "@/components/admin/AdminShell";
import { AppShell } from "@/components/layout/AppShell";

/**
 * Shell de Configurações (perfil / segurança):
 * - Admin e gerentes → sidebar do painel Admin
 * - Sellers → sidebar da dashboard de usuário
 */
export function ConfigShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg-app)", color: "var(--text-3)", fontSize: 13 }}
      >
        Carregando…
      </div>
    );
  }

  if (isAdmin) {
    return <AdminShell title={title}>{children}</AdminShell>;
  }

  return <AppShell title={title}>{children}</AppShell>;
}
