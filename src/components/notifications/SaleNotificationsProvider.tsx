"use client";

import { useEffect, useRef } from "react";
import {
  emitSaleEvent,
  loadNotificationPrefs,
  playCashRegisterSound,
  resolveNotificationIconAsync,
  shouldAlertSale,
  showSaleBrowserNotification,
  unlockNotificationAudio,
  type NotificationPrefs,
  type SaleNotifyPayload,
} from "@/lib/notifications";
import { authedFetch } from "@/lib/client/session";

const POLL_INTERVAL_MS = 8000;

type PollTx = {
  id: string;
  date: string;
  kind: string;
  amount: number;
  status: string;
  description?: string;
  sellerId?: string;
};

/**
 * Escuta eventos reais `darkpay:sale` (venda gerada / venda paga).
 * Também faz polling de novas transações aprovadas para disparar notificações.
 * Som de caixa: só nesses eventos — nunca em clique/foco/timer solto.
 */
export function SaleNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const prefsRef = useRef<NotificationPrefs>(loadNotificationPrefs());
  const lastTxIdRef = useRef<string>("");
  const lastPaidIdRef = useRef<string>("");

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

      const saleKey = `${detail.kind}:${detail.id || "no-id"}:${detail.amount}`;
      playCashRegisterSound(saleKey);

      void showSaleBrowserNotification(prefs, detail, { force: false });
    }

    async function pollTransactions() {
      try {
        const res = await authedFetch(
          `/api/v1/transactions?pageSize=10&page=1`
        );
        if (!res.ok) return;
        const json = (await res.json()) as {
          items?: PollTx[];
          source?: string;
        };
        if (!json.items?.length) return;

        const paid = json.items.filter(
          (t) =>
            t.kind === "venda" && t.status === "aprovada"
        );

        const newestPaid = paid[0];
        if (newestPaid && newestPaid.id !== lastPaidIdRef.current) {
          if (lastPaidIdRef.current) {
            emitSaleEvent({
              kind: "aprovada",
              amount: newestPaid.amount,
              customer: newestPaid.description,
              product: newestPaid.description,
              id: newestPaid.id,
            });
          }
          lastPaidIdRef.current = newestPaid.id;
        }

        const newestTx = json.items[0];
        if (
          newestTx &&
          newestTx.status === "pendente" &&
          newestTx.id !== lastTxIdRef.current
        ) {
          if (lastTxIdRef.current) {
            emitSaleEvent({
              kind: "gerada",
              amount: newestTx.amount,
              customer: newestTx.description,
              id: newestTx.id,
            });
          }
          lastTxIdRef.current = newestTx.id;
        }
      } catch {
        // polling silencioso
      }
    }

    const pollTimer = setInterval(pollTransactions, POLL_INTERVAL_MS);
    pollTransactions();

    window.addEventListener("darkpay:notifications", onPrefs);
    window.addEventListener("darkpay:sale", onSale);
    return () => {
      clearInterval(pollTimer);
      for (const ev of unlockEvents) {
        window.removeEventListener(ev, unlockOnce, true);
      }
      window.removeEventListener("darkpay:notifications", onPrefs);
      window.removeEventListener("darkpay:sale", onSale);
    };
  }, []);

  return <>{children}</>;
}
