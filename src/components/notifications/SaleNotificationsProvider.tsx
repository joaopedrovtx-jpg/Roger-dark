"use client";

import { useEffect, useRef } from "react";
import {
  loadNotificationPrefs,
  showSaleBrowserNotification,
  type NotificationPrefs,
  type SaleNotifyPayload,
} from "@/lib/notifications";

/**
 * Só escuta eventos reais `darkpay:sale`.
 * Origem: Integrações → Pagamentos (criar PIX / pagamento confirmado).
 * Sem simulação, sem timer de demo.
 */
export function SaleNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const prefsRef = useRef<NotificationPrefs>(loadNotificationPrefs());

  useEffect(() => {
    prefsRef.current = loadNotificationPrefs();

    function onPrefs(e: Event) {
      const detail = (e as CustomEvent<NotificationPrefs>).detail;
      if (detail) prefsRef.current = detail;
      else prefsRef.current = loadNotificationPrefs();
    }

    function onSale(e: Event) {
      const detail = (e as CustomEvent<SaleNotifyPayload>).detail;
      if (!detail?.kind) return;
      if (detail.kind !== "gerada" && detail.kind !== "aprovada") return;
      // Ignora ids de simulação legados, se existirem
      if (detail.id?.startsWith("sim-")) return;
      showSaleBrowserNotification(prefsRef.current, detail, { force: false });
    }

    window.addEventListener("darkpay:notifications", onPrefs);
    window.addEventListener("darkpay:sale", onSale);
    return () => {
      window.removeEventListener("darkpay:notifications", onPrefs);
      window.removeEventListener("darkpay:sale", onSale);
    };
  }, []);

  return <>{children}</>;
}
