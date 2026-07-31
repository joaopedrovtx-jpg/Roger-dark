"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api/query-client";
import type { PaymentChargeView } from "@/hooks/usePayments";

export interface UsePaymentStatusOptions {
  pollIntervalMs?: number;
  /** Estados terminais que param o streaming. */
  stopOn?: Array<PaymentChargeView["status"]>;
  timeoutMs?: number;
}

/**
 * Streaming de status de pagamento (polling leve, sem React Query).
 * Útil para página de checkout onde você quer stops manuais.
 */
export function usePaymentStatus(
  chargeId: string | null | undefined,
  options: UsePaymentStatusOptions = {}
) {
  const {
    pollIntervalMs = 2500,
    stopOn = ["paid", "expirado", "expired", "completed"],
    timeoutMs = 15 * 60 * 1000,
  } = options;

  const [status, setStatus] = useState<PaymentChargeView["status"] | null>(
    null
  );
  const [charge, setCharge] = useState<PaymentChargeView | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [stopped, setStopped] = useState(false);
  const startedRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!chargeId) return;
    setStatus(null);
    setCharge(null);
    setError(null);
    setStopped(false);
    startedRef.current = Date.now();

    let cancelled = false;

    async function tick() {
      if (cancelled || stopped) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;

      try {
        const data = await apiGet<PaymentChargeView>(
          `/api/v1/payments/${chargeId}`
        );
        if (cancelled) return;
        setCharge(data);
        setStatus(data.status);
        if (data.status && stopOn.includes(data.status)) {
          setStopped(true);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    }

    void tick();
    const id = setInterval(tick, pollIntervalMs);
    const timeoutId = setTimeout(() => setStopped(true), timeoutMs);

    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeId, pollIntervalMs, timeoutMs]);

  return {
    status,
    charge,
    error,
    stopped,
    expired: status === "expirado" || status === "expired",
    paid: status === "paid" || status === "aprovada",
    loading: status === null,
  };
}