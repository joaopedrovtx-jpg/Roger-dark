"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, ShieldAlert, X } from "lucide-react";
import { AdminSidebar } from "./AdminSidebar";
import { UserMenu } from "@/components/layout/UserMenu";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLoadingScreen } from "@/components/layout/BrandLoadingScreen";

interface AdminShellProps {
  children: React.ReactNode;
  title?: string;
}

export function AdminShell({ children, title }: AdminShellProps) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();
  const displayName = user?.name ?? (loading ? "…" : "Admin");
  const avatarUrl = user?.avatarUrl ?? null;
  const mustSetup2fa = !!user?.mustSetup2fa;
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/admin");
      return;
    }
    if (!isAdmin) {
      router.replace("/?error=admin_required");
      return;
    }
    const path = window.location.pathname;
    import("@/lib/staff").then(
      ({ hasStaffPermission, permissionForAdminPath, firstAllowedAdminPath }) => {
        const need = permissionForAdminPath(path);
        if (need && !hasStaffPermission(user, need)) {
          router.replace(firstAllowedAdminPath(user));
        }
      }
    );
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 1024) setNavOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (loading) {
    return <BrandLoadingScreen label="Verificando acesso…" />;
  }

  if (!user || !isAdmin) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4 text-center"
        style={{ background: "var(--bg-app)", color: "var(--text-2)" }}
      >
        Acesso restrito a administradores e gerentes.
      </div>
    );
  }

  return (
    <>
      <div className="app-shell">
        <header
          className="app-mobile-topbar lg:hidden"
          style={{ gridColumn: "1 / -1" }}
        >
          <button
            type="button"
            className="app-icon-btn"
            aria-label={navOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="app-mobile-topbar__brand">
            <BrandLogo />
          </div>
          <div className="shrink-0">
            <UserMenu name={displayName} avatarUrl={avatarUrl} />
          </div>
        </header>

        <div className="app-shell__sidebar">
          <AdminSidebar />
        </div>

        <main className="app-shell__main">
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
          <div className="flex items-center justify-between gap-3 mb-4">
            {title ? (
              <h1 className="page-title min-w-0 truncate">{title}</h1>
            ) : (
              <div />
            )}
            <div className="hidden lg:block shrink-0">
              <UserMenu name={displayName} avatarUrl={avatarUrl} />
            </div>
          </div>
          {children}
        </main>
      </div>

      {navOpen ? (
        <div
          className="app-drawer-backdrop lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu admin"
          onClick={() => setNavOpen(false)}
        >
          <div className="app-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-end p-3">
              <button
                type="button"
                className="app-icon-btn"
                aria-label="Fechar menu"
                onClick={() => setNavOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <AdminSidebar onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
