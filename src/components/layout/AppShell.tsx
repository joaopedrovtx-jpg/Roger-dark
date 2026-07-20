"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";
import { BrandLogo } from "./BrandLogo";
import { AccountPendingBanner } from "./AccountPendingBanner";
import { AccountAccessGate } from "./AccountAccessGate";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { SaleNotificationsProvider } from "@/components/notifications/SaleNotificationsProvider";
import { useAuth } from "@/components/auth/AuthProvider";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  /** Não redireciona páginas KYC (ex.: documentos). Default: true */
  enforceKyc?: boolean;
}

export function AppShell({
  children,
  title,
  enforceKyc = true,
}: AppShellProps) {
  const { user, loading } = useAuth();
  const displayName = user?.name ?? (loading ? "…" : "Usuário");
  const avatarUrl = user?.avatarUrl ?? null;
  const [navOpen, setNavOpen] = useState(false);

  // trava scroll do body com drawer aberto
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  // fecha drawer ao redimensionar para desktop
  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 1024) setNavOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const body = (
    <>
      <ImpersonationBanner />
      <AccountPendingBanner />
      <div className="flex items-center justify-between gap-3 mb-4">
        {title ? <h1 className="page-title min-w-0 truncate">{title}</h1> : <div />}
        {/* No desktop o menu fica aqui; no mobile já está na topbar */}
        <div className="hidden lg:block shrink-0">
          <UserMenu name={displayName} avatarUrl={avatarUrl} />
        </div>
      </div>
      {children}
    </>
  );

  return (
    <SaleNotificationsProvider>
      <div className="app-shell">
        {/* Topbar mobile / tablet */}
        <header className="app-mobile-topbar lg:hidden" style={{ gridColumn: "1 / -1" }}>
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

        {/* Sidebar desktop */}
        <div className="app-shell__sidebar">
          <Sidebar />
        </div>

        <main className="app-shell__main">
          {enforceKyc ? (
            <AccountAccessGate>{body}</AccountAccessGate>
          ) : (
            body
          )}
        </main>
      </div>

      {/* Drawer mobile / tablet */}
      {navOpen ? (
        <div
          className="app-drawer-backdrop lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
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
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </div>
        </div>
      ) : null}
    </SaleNotificationsProvider>
  );
}
