"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useBranding } from "@/components/branding/BrandingProvider";
import {
  normalizeExternalUrl,
  type BrandBanner,
} from "@/lib/branding";

const AUTO_MS = 5000;

const FALLBACK: BrandBanner[] = [
  {
    id: "bn_fallback",
    imageUrl: "/banner-darkpay.jpg",
    name: "Banner principal",
    linkUrl: "",
  },
];

/**
 * Banner promocional da Dashboard.
 * 1 imagem = estático · 2+ = carrossel
 * Com linkUrl preenchido, o clique abre o destino.
 */
export function PromoBanner() {
  const { branding } = useBranding();
  const banners =
    branding.banners?.length > 0 ? branding.banners : FALLBACK;
  const multi = banners.length > 1;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [banners.length, banners[0]?.id, banners[0]?.imageUrl]);

  useEffect(() => {
    if (!multi) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % banners.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [multi, banners.length]);

  const safeIndex = Math.min(index, banners.length - 1);
  const current = banners[safeIndex] ?? banners[0];
  const href = normalizeExternalUrl(current.linkUrl);
  const clickable = Boolean(href);

  function go(delta: number) {
    setIndex((i) => (i + delta + banners.length) % banners.length);
  }

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={current.id + safeIndex}
      src={current.imageUrl}
      alt={current.name || "Banner promocional"}
      className="w-full block"
      style={{
        width: "100%",
        height: "auto",
        maxHeight: 160,
        objectFit: "cover",
        objectPosition: "center",
        display: "block",
      }}
    />
  );

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border-card)",
        background: "var(--bg-card)",
      }}
    >
      {clickable ? (
        <a
          href={href}
          target={href.startsWith("/") ? undefined : "_blank"}
          rel={href.startsWith("/") ? undefined : "noopener noreferrer"}
          style={{ display: "block", cursor: "pointer" }}
          aria-label={
            current.name
              ? `Abrir ${current.name}`
              : "Abrir link do banner"
          }
        >
          {image}
        </a>
      ) : (
        image
      )}

      {multi ? (
        <>
          <button
            type="button"
            aria-label="Banner anterior"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(-1);
            }}
            className="absolute flex items-center justify-center"
            style={{
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              width: 32,
              height: 32,
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "rgba(0,0,0,0.45)",
              color: "#fff",
              cursor: "pointer",
              zIndex: 2,
            }}
          >
            <ChevronLeft size={18} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            aria-label="Próximo banner"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              go(1);
            }}
            className="absolute flex items-center justify-center"
            style={{
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              width: 32,
              height: 32,
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "rgba(0,0,0,0.45)",
              color: "#fff",
              cursor: "pointer",
              zIndex: 2,
            }}
          >
            <ChevronRight size={18} strokeWidth={2.2} />
          </button>

          <div
            className="absolute flex items-center justify-center gap-1.5"
            style={{
              left: 0,
              right: 0,
              bottom: 10,
              zIndex: 2,
            }}
          >
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Ir para banner ${i + 1}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIndex(i);
                }}
                style={{
                  width: i === safeIndex ? 16 : 6,
                  height: 6,
                  borderRadius: 99,
                  border: "none",
                  padding: 0,
                  background:
                    i === safeIndex
                      ? "#ffffff"
                      : "rgba(255,255,255,0.4)",
                  cursor: "pointer",
                  transition: "width 160ms ease, background 160ms ease",
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
