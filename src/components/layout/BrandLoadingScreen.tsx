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
 * Tela cheia de carregamento: logo principal do sistema no centro,
 * piscando/pulsando (login, bootstrap da sessão, shells).
 * Sempre permanece visível no mínimo BRAND_LOADING_MIN_MS quando o pai
 * combina com waitBrandLoadingMin.
 */
export function BrandLoadingScreen({
  label = "Carregando…",
}: {
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
      aria-label={label}
      className="brand-loading-screen"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-app)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt="Dark Pay"
        className="brand-logo-pulse"
        style={{
          height: 72,
          width: "auto",
          maxWidth: "min(280px, 70vw)",
          objectFit: "contain",
          display: "block",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
