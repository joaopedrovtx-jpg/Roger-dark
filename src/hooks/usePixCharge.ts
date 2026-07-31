"use client";

import { useEffect, useRef, useState } from "react";
import { usePayment, useSyncPayment } from "@/hooks/usePayments";
import type { PaymentChargeView } from "@/hooks/usePayments";

export interface UsePixChargeOptions {
  /** Intervalo de polling para confirmed/expired (ms). Default 3000. */
  pollIntervalMs?: number;
  /** Para quando status for pago/expirado. */
  stopOn?: Array<PaymentChargeView["status"]>;
  /** Limite de polling (ms) p/ fail-safe, default 15 min. */
  timeoutMs?: number;
}

/**
 * Wrapper de cobrança PIX com polling automático até `paid` / `expired`.
 * Combina `usePayment` (React Query) + sync manual via `/sync`.
 *
 * Uso:
 *   const { charge, status, expired, paid } = usePixCharge(chargeId);
 */
export function usePixCharge(
  chargeId: string | null | undefined,
  options: UsePixChargeOptions = {}
) {
  const {
    pollIntervalMs = 3000,
    stopOn = ["paid", "expirado", "expired", "completed"],
    timeoutMs = 15 * 60 * 1000,
  } = options;

  const query = usePayment(chargeId ?? "");
  const sync = useSyncPayment(chargeId ?? "");
  const startedRef = useRef<number>(Date.now());
  const [stopped, setStopped] = useState(false);

  const charge = query.data;
  const status = charge?.status;

  useEffect(() => {
    if (!chargeId) return;
    setStopped(false);
    startedRef.current = Date.now();
  }, [chargeId]);

  useEffect(() => {
    if (!chargeId || stopped) return;
    if (status && stopOn.includes(status)) {
      setStopped(true);
      return;
    }
    if (Date.now() - startedRef.current >= timeoutMs) {
      setStopped(true);
      return;
    }

    const id = setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void query.refetch();
    }, pollIntervalMs);

    return () => clearInterval(id);
  }, [chargeId, status, stopped, pollIntervalMs, timeoutMs, stopOn, query]);

  const triggerSync = () => sync.mutate();

  return {
    charge,
    status,
    loading: query.isLoading || query.isFetching,
    expired: status === "expirado" || status === "expired",
    paid: status === "paid" || status === "aprovada",
    stopped,
    triggerSync,
    syncing: sync.isPending,
    refresh: () => query.refetch(),
  };
}