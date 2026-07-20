"use client";

import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";
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

  const body = (
    <>
      <ImpersonationBanner />
      <AccountPendingBanner />
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
    </>
  );

  return (
    <SaleNotificationsProvider>
      <div
        className="min-h-screen grid"
        style={{
          gridTemplateColumns: "var(--sidebar-width) 1fr",
          gridTemplateRows: "1fr",
          background: "var(--bg-app)",
        }}
      >
        <div style={{ gridColumn: 1, gridRow: 1 }}>
          <Sidebar />
        </div>
        <main
          className="min-w-0"
          style={{
            gridColumn: 2,
            gridRow: 1,
            padding: "14px 20px 24px 12px",
          }}
        >
          {enforceKyc ? (
            <AccountAccessGate>{body}</AccountAccessGate>
          ) : (
            body
          )}
        </main>
      </div>
    </SaleNotificationsProvider>
  );
}
