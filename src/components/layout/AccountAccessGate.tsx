"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  accountLocked,
  isKycAllowedPath,
  kycBlockedRedirectPath,
} from "@/lib/kyc";
import { isImpersonating } from "@/lib/client/impersonate";
import { BrandLoadingScreen } from "@/components/layout/BrandLoadingScreen";

/**
 * Bloqueia páginas do gateway enquanto a conta seller não está ativa.
 * Dashboard e /configuracoes/* ficam liberadas; o resto volta para /dash.
 * Staff em modo visualização (prova social) não é bloqueado.
 */
export function AccountAccessGate({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    setViewing(isImpersonating());
    function sync() {
      setViewing(isImpersonating());
    }
    window.addEventListener("darkpay:impersonate", sync);
    return () => window.removeEventListener("darkpay:impersonate", sync);
  }, []);

  // Staff só visualizando: ignora KYC do próprio admin
  const skipGate = isAdmin || viewing;
  const locked = !skipGate && accountLocked(user);
  const allowed = isKycAllowedPath(pathname || "");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (skipGate) return;
    if (!locked) return;
    if (allowed) return;
    router.replace(kycBlockedRedirectPath());
  }, [loading, user, locked, allowed, router, pathname, skipGate]);

  if (loading) {
    return <BrandLoadingScreen label="Carregando…" />;
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
