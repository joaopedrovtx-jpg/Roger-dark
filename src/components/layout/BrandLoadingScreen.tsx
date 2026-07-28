"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BRANDING, loadBranding } from "@/lib/branding";

/** Tempo mínimo da logo pulsando (carregamento / login / entrada). */
export const BRAND_LOADING_MIN_MS = 2000;

/**
 * Espera o restante do tempo mínimo desde `startedAt`.
 * Se o trabalho já passou de 2s, resolve na hora.
 */
export function waitBrandLoadingMin(
  startedAt: number,
  minMs: number = BRAND_LOADING_MIN_MS
): Promise<void> {
  const left = minMs - (Date.now() - startedAt);
  if (left <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, left);
  });
}

/**
 * Tela cheia de carregamento: só a logo pulsando no centro.
 * Sem texto sob/atrás da logo (login, logout, bootstrap, shells).
 */
export function BrandLoadingScreen({
  label: _label = "Carregando…",
}: {
  /** Mantido por compat; não é exibido visualmente. */
  label?: string;
}) {
  const [logoUrl, setLogoUrl] = useState(DEFAULT_BRANDING.logoUrl);

  useEffect(() => {
    try {
      setLogoUrl(loadBranding().logoUrl || DEFAULT_BRANDING.logoUrl);
    } catch {
      setLogoUrl(DEFAULT_BRANDING.logoUrl);
    }
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Carregando"
      className="brand-loading-screen"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-app)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt=""
        className="brand-logo-pulse"
        style={{
          height: 104,
          width: "auto",
          maxWidth: "min(360px, 78vw)",
          objectFit: "contain",
          display: "block",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
