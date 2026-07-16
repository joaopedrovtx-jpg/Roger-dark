"use client";

import Link from "next/link";
import { useBranding } from "@/components/branding/BrandingProvider";

export function BrandLogo() {
  const { branding } = useBranding();

  return (
    <Link
      href="/"
      className="flex items-center select-none"
      style={{ textDecoration: "none" }}
      aria-label="Dark Pay — início"
    >
      {/* Logo recortada (sem fundo preto) — personalizável no Admin */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={branding.logoUrl}
        alt="Dark Pay"
        height={44}
        style={{
          height: 44,
          width: "auto",
          maxWidth: 220,
          objectFit: "contain",
          objectPosition: "left center",
          display: "block",
        }}
      />
    </Link>
  );
}
