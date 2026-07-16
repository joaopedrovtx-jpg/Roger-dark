"use client";

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
