"use client";

import { useEffect, useRef } from "react";
import {
  emitSaleEvent,
  ensureNotificationServiceWorker,
  loadNotificationPrefs,
  primeCashRegisterSound,
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
  kind?: string;
  amount: number;
  status: string;
  description?: string;
  userName?: string;
};

type MeUser = {
  roles?: string[];
};

function isStaffRoles(roles: string[] | undefined): boolean {
  if (!roles?.length) return false;
  return roles.some((r) => r === "admin" || r === "manager");
}

/**
 * Escuta `darkpay:sale` + polling de novas vendas.
 * - Seller: `/api/v1/transactions`
 * - Admin/gerente: ledger de `/api/v1/admin/dashboard` (vendas da plataforma)
 *
 * Som: public/sounds/cash-register.mp3 (via CASH_REGISTER_SOUND_URL).
 * Som + notificação nativa no mesmo tick.
 */
export function SaleNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const prefsRef = useRef<NotificationPrefs>(loadNotificationPrefs());
  const lastTxIdRef = useRef<string>("");
  const lastPaidIdRef = useRef<string>("");
  const isStaffRef = useRef(false);
  const roleReadyRef = useRef(false);
  /** Para de poluir o console/rede se a sessão caiu (401). */
  const authDeadRef = useRef(false);
  const authFailCountRef = useRef(0);

  useEffect(() => {
    prefsRef.current = loadNotificationPrefs();
    authDeadRef.current = false;
    authFailCountRef.current = 0;
    void resolveNotificationIconAsync();
    primeCashRegisterSound();
    // SW: notificação com ícone Dark Pay (Safari costuma ignorar new Notification icon)
    void ensureNotificationServiceWorker();

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

      void showSaleBrowserNotification(prefs, detail, {
        force: false,
        playSound: true,
      });
    }

    function markAuthOk() {
      authFailCountRef.current = 0;
      authDeadRef.current = false;
    }

    function markAuthFail(status: number) {
      if (status !== 401 && status !== 403) return;
      authFailCountRef.current += 1;
      if (authFailCountRef.current >= 2) {
        authDeadRef.current = true;
      }
    }

    async function resolveRole() {
      try {
        const res = await authedFetch("/api/v1/auth/me");
        if (!res.ok) {
          markAuthFail(res.status);
          return;
        }
        markAuthOk();
        // /api/v1/auth/me devolve o user no root (não { user })
        const json = (await res.json()) as MeUser & { user?: MeUser };
        const roles = json.roles ?? json.user?.roles;
        isStaffRef.current = isStaffRoles(roles);
      } catch {
        isStaffRef.current = false;
      } finally {
        roleReadyRef.current = true;
      }
    }

    function handleNewest(
      items: PollTx[],
      mode: "seller" | "admin"
    ) {
      if (!items.length) return;

      const paid = items.filter((t) => {
        if (mode === "admin") {
          // ledger admin: venda aprovada ou status "aprovada"
          return (
            (t.kind === "venda" || !t.kind) &&
            (t.status === "aprovada" || t.status === "pago")
          );
        }
        return t.kind === "venda" && t.status === "aprovada";
      });

      // Preferir vendas (entrada) no admin ledger
      const paidSales =
        mode === "admin"
          ? items.filter(
              (t) =>
                t.kind === "venda" &&
                (t.status === "aprovada" || t.status === "pago")
            )
          : paid;

      const newestPaid = paidSales[0] || paid[0];
      if (newestPaid && newestPaid.id !== lastPaidIdRef.current) {
        if (lastPaidIdRef.current) {
          emitSaleEvent({
            kind: "aprovada",
            amount: newestPaid.amount,
            customer:
              newestPaid.userName || newestPaid.description || undefined,
            product: newestPaid.description,
            id: newestPaid.id,
          });
        }
        lastPaidIdRef.current = newestPaid.id;
      }

      if (mode === "seller") {
        const newestTx = items[0];
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
      } else {
        // Admin: venda pendente no ledger
        const newestPending = items.find(
          (t) => t.kind === "venda" && t.status === "pendente"
        );
        if (
          newestPending &&
          newestPending.id !== lastTxIdRef.current
        ) {
          if (lastTxIdRef.current) {
            emitSaleEvent({
              kind: "gerada",
              amount: newestPending.amount,
              customer:
                newestPending.userName ||
                newestPending.description ||
                undefined,
              id: newestPending.id,
            });
          }
          lastTxIdRef.current = newestPending.id;
        }
      }
    }

    async function pollTransactions() {
      if (!roleReadyRef.current || authDeadRef.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }
      try {
        if (isStaffRef.current) {
          const res = await authedFetch(
            `/api/v1/admin/dashboard?period=7d`
          );
          if (!res.ok) {
            markAuthFail(res.status);
            return;
          }
          markAuthOk();
          const json = (await res.json()) as { ledger?: PollTx[] };
          if (!json.ledger?.length) return;
          handleNewest(json.ledger, "admin");
          return;
        }

        const res = await authedFetch(
          `/api/v1/transactions?pageSize=10&page=1`
        );
        if (!res.ok) {
          markAuthFail(res.status);
          return;
        }
        markAuthOk();
        const json = (await res.json()) as { items?: PollTx[] };
        if (!json.items?.length) return;
        handleNewest(json.items, "seller");
      } catch {
        // polling silencioso (rede offline, etc.)
      }
    }

    void resolveRole().then(() => {
      pollTransactions();
    });

    const pollTimer = setInterval(pollTransactions, POLL_INTERVAL_MS);

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
