"use client";

import type { ReactNode } from "react";
import { useBranding } from "@/components/branding/BrandingProvider";

interface AuthShellProps {
  children: ReactNode;
}

/**
 * Layout split: painel esquerdo = imagem de login (personalizável no Admin),
 * painel direito = formulário. Login e registro usam a mesma imagem.
 */
export function AuthShell({ children }: AuthShellProps) {
  const { branding } = useBranding();
  const authImage = branding.authImageUrl;

  return (
    <div
      className="min-h-screen w-full lg:grid"
      style={{
        background: "var(--bg-app)",
        gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, 0.85fr)",
      }}
    >
      {/* Imagem full-bleed personalizada em Admin → Personalização */}
      <aside
        className="relative hidden min-h-screen overflow-hidden lg:block"
        style={{
          background: "#0a0c10",
          borderRight: "1px solid var(--border-card)",
        }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={authImage}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            display: "block",
          }}
        />
      </aside>

      {/* Coluna do formulário */}
      <main
        className="flex min-h-screen flex-col items-center justify-center w-full"
        style={{
          background: "var(--bg-app)",
          padding: "max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="w-full" style={{ maxWidth: 400 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
