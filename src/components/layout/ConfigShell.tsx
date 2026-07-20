"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { AdminShell } from "@/components/admin/AdminShell";
import { AppShell } from "@/components/layout/AppShell";
import { BrandLoadingScreen } from "@/components/layout/BrandLoadingScreen";

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
    return <BrandLoadingScreen label="Carregando…" />;
  }

  if (isAdmin) {
    return <AdminShell title={title}>{children}</AdminShell>;
  }

  return <AppShell title={title}>{children}</AppShell>;
}
