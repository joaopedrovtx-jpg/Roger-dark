"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyFavicon,
  cloneDefaultBranding,
  loadBranding,
  saveBranding,
  type PlatformBranding,
} from "@/lib/branding";

interface BrandingContextValue {
  branding: PlatformBranding;
  setBranding: (next: PlatformBranding) => void;
  updateBranding: (partial: Partial<PlatformBranding>) => void;
  resetBranding: () => void;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBrandingState] = useState<PlatformBranding>(
    cloneDefaultBranding
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = loadBranding();
    setBrandingState(loaded);
    applyFavicon(loaded.faviconUrl);
    setReady(true);

    function onStorage(e: StorageEvent) {
      if (
        e.key !== "darkpay.branding.v4" &&
        e.key !== "darkpay.branding.v3" &&
        e.key !== "darkpay.branding.v2" &&
        e.key !== "darkpay.branding.v1"
      ) {
        return;
      }
      const next = loadBranding();
      setBrandingState(next);
      applyFavicon(next.faviconUrl);
    }
    function onCustom(e: Event) {
      const detail = (e as CustomEvent<PlatformBranding>).detail;
      if (!detail) return;
      setBrandingState(detail);
      applyFavicon(detail.faviconUrl);
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("darkpay:branding", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("darkpay:branding", onCustom);
    };
  }, []);

  const setBranding = useCallback((next: PlatformBranding) => {
    setBrandingState(next);
    saveBranding(next);
    applyFavicon(next.faviconUrl);
  }, []);

  const updateBranding = useCallback((partial: Partial<PlatformBranding>) => {
    setBrandingState((prev) => {
      const next = { ...prev, ...partial };
      saveBranding(next);
      if (partial.faviconUrl !== undefined) {
        applyFavicon(next.faviconUrl);
      }
      return next;
    });
  }, []);

  const resetBranding = useCallback(() => {
    setBranding(cloneDefaultBranding());
  }, [setBranding]);

  const value = useMemo(
    () => ({ branding, setBranding, updateBranding, resetBranding }),
    [branding, setBranding, updateBranding, resetBranding]
  );

  // Evita flash de default → custom no SSR
  if (!ready) {
    return (
      <BrandingContext.Provider value={value}>
        {children}
      </BrandingContext.Provider>
    );
  }

  return (
    <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    // Fallback seguro se usado fora do provider
    return {
      branding: cloneDefaultBranding(),
      setBranding: () => {},
      updateBranding: () => {},
      resetBranding: () => {},
    };
  }
  return ctx;
}
