"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  accountLocked,
  isKycAllowedPath,
  kycBlockedRedirectPath,
} from "@/lib/kyc";

/**
 * Bloqueia páginas do gateway enquanto a conta seller não está ativa.
 * Dashboard e /configuracoes/* ficam liberadas; o resto volta para /dash.
 */
export function AccountAccessGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const locked = accountLocked(user);
  const allowed = isKycAllowedPath(pathname || "");

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (!locked) return;
    if (allowed) return;
    router.replace(kycBlockedRedirectPath());
  }, [loading, user, locked, allowed, router, pathname]);

  if (loading) {
    return (
      <div
        style={{
          padding: 24,
          color: "var(--text-3)",
          fontSize: 13,
        }}
      >
        Carregando…
      </div>
    );
  }

  if (locked && !allowed) {
    return (
      <div
        style={{
          padding: 24,
          color: "var(--text-2)",
          fontSize: 13.5,
          lineHeight: 1.5,
        }}
      >
        Conta ainda não liberada. Redirecionando para o dashboard…
      </div>
    );
  }

  return <>{children}</>;
}
