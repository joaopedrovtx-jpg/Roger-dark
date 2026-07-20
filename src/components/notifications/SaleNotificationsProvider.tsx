"use client";

import { useEffect, useRef } from "react";
import {
  loadNotificationPrefs,
  playCashRegisterSound,
  resolveNotificationIconAsync,
  shouldAlertSale,
  showSaleBrowserNotification,
  unlockNotificationAudio,
  type NotificationPrefs,
  type SaleNotifyPayload,
} from "@/lib/notifications";

/**
 * Escuta apenas eventos reais `darkpay:sale` (venda gerada / venda paga).
 * Som de caixa: só nesses eventos — nunca em clique/foco/timer solto.
 */
export function SaleNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const prefsRef = useRef<NotificationPrefs>(loadNotificationPrefs());

  useEffect(() => {
    prefsRef.current = loadNotificationPrefs();
    void resolveNotificationIconAsync();

    // Desbloqueio silencioso de autoplay (1º gesto). Não toca o cha-ching.
    const unlockOnce = () => unlockNotificationAudio();
    const unlockEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
    ];
    for (const ev of unlockEvents) {
      window.addEventListener(ev, unlockOnce, { capture: true, passive: true });
    }

    function onPrefs(e: Event) {
      const detail = (e as CustomEvent<NotificationPrefs>).detail;
      if (detail) prefsRef.current = detail;
      else prefsRef.current = loadNotificationPrefs();
    }

    function onSale(e: Event) {
      const detail = (e as CustomEvent<SaleNotifyPayload>).detail;
      if (!detail?.kind) return;
      if (detail.kind !== "gerada" && detail.kind !== "aprovada") return;
      if (detail.id?.startsWith("sim-")) return;

      const prefs = prefsRef.current;
      if (!shouldAlertSale(prefs, detail, false)) return;

      // Som só na venda real (chave de dedupe)
      const saleKey = `${detail.kind}:${detail.id || "no-id"}:${detail.amount}`;
      playCashRegisterSound(saleKey);

      void showSaleBrowserNotification(prefs, detail, { force: false });
    }

    window.addEventListener("darkpay:notifications", onPrefs);
    window.addEventListener("darkpay:sale", onSale);
    return () => {
      for (const ev of unlockEvents) {
        window.removeEventListener(ev, unlockOnce, true);
      }
      window.removeEventListener("darkpay:notifications", onPrefs);
      window.removeEventListener("darkpay:sale", onSale);
    };
  }, []);

  return <>{children}</>;
}
