"use client";

import { useCallback } from "react";
import {
  loadNotificationPrefs,
  playCashRegisterSound,
  primeCashRegisterSound,
  shouldAlertSale,
  showSaleBrowserNotification,
  unlockNotificationAudio,
  type SaleNotifyPayload,
} from "@/lib/notifications";

/**
 * Wrapper de som/notificação nativa de venda.
 * Lobster "cha-ching" — útil p/ fluxos de checkout e webhook manual.
 */
export function useSaleSound() {
  const play = useCallback((payload: SaleNotifyPayload) => {
    const prefs = loadNotificationPrefs();
    if (!shouldAlertSale(prefs, payload, false)) return;
    void showSaleBrowserNotification(prefs, payload, {
      force: false,
      playSound: true,
    });
  }, []);

  const prime = useCallback(() => {
    primeCashRegisterSound();
    unlockNotificationAudio();
  }, []);

  const ring = useCallback((saleKey?: string) => {
    playCashRegisterSound(saleKey);
  }, []);

  return { play, prime, ring };
}