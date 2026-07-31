"use client";

import { useMemo } from "react";
import { useImpersonate } from "@/components/auth/ImpersonateProvider";

/**
 * Banner "você está visualizando a conta de X".
 * Hook curado p/ header/avisos — lê do ImpersonateProvider.
 */
export function useImpersonationBanner() {
  const { seller, impersonating, stop } = useImpersonate();

  return useMemo(
    () => ({
      visible: impersonating && Boolean(seller?.id),
      seller,
      message: seller
        ? `Você está visualizando a conta de ${seller.name}${
            seller.email ? ` (${seller.email})` : ""
          }`
        : "",
      stop,
    }),
    [impersonating, seller, stop]
  );
}