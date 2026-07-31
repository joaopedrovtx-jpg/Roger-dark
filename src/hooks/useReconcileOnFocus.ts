"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * Invalida queries-chave quando a aba volta a focar.
 * Útil p/ reconcile de vendas/saques ao voltar do pagamento.
 *
 * Uso:
 *   useReconcileOnFocus(["dashboard"], ["transactions"]);
 *   // ou
 *   useReconcileOnFocus(["dashboard"]);
 */
export function useReconcileOnFocus(...queryKeys: QueryKey[]) {
  const qc = useQueryClient();
  const serialized = JSON.stringify(queryKeys);

  useEffect(() => {
    const keys: QueryKey[] = JSON.parse(serialized) as QueryKey[];
    function onFocus() {
      for (const key of keys) {
        qc.invalidateQueries({ queryKey: key });
      }
    }
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [qc, serialized]);
}