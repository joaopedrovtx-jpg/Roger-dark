"use client";

import { useEffect, useRef } from "react";
import {
  emitSaleEvent,
  ensureNotificationServiceWorker,
  loadNotificationPrefs,
  markSaleNotificationSeen,
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
  product?: string;
  customer?: string;
  userName?: string;
  /** charge id / provider id quando a API expuser */
  providerId?: string;
  chargeId?: string;
};

type MeUser = {
  roles?: string[];
};

function isStaffRoles(roles: string[] | undefined): boolean {
  if (!roles?.length) return false;
  return roles.some((r) => r === "admin" || r === "manager");
}

function isSaleRow(t: PollTx, mode: "seller" | "admin"): boolean {
  if (mode === "seller") {
    // API de transações do seller só lista vendas; kind pode vir omitido
    return !t.kind || t.kind === "venda";
  }
  return t.kind === "venda" || !t.kind;
}

function isPendingSale(t: PollTx, mode: "seller" | "admin"): boolean {
  return isSaleRow(t, mode) && t.status === "pendente";
}

function isPaidSale(t: PollTx, mode: "seller" | "admin"): boolean {
  if (!isSaleRow(t, mode)) return false;
  return t.status === "aprovada" || t.status === "pago";
}

function aliasIdsFor(t: PollTx): string[] {
  const out: string[] = [];
  if (t.id) out.push(t.id);
  if (t.providerId) out.push(t.providerId);
  if (t.chargeId) out.push(t.chargeId);
  return out;
}

/**
 * Escuta `darkpay:sale` + polling de novas vendas.
 * - Seller: `/api/v1/transactions`
 * - Admin/gerente: ledger de `/api/v1/admin/dashboard` (vendas da plataforma)
 *
 * Anti-duplicata:
 * - Bootstrap: 1º poll só marca IDs vistos (não notifica histórico)
 * - Depois: percorre TODAS as linhas da página (não só a #1)
 * - claimSaleNotification unifica charge.id ↔ transactionId (localStorage)
 */
export function SaleNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const prefsRef = useRef<NotificationPrefs>(loadNotificationPrefs());
  const bootstrappedRef = useRef(false);
  const isStaffRef = useRef(false);
  const roleReadyRef = useRef(false);
  /** Para de poluir o console/rede se a sessão caiu (401). */
  const authDeadRef = useRef(false);
  const authFailCountRef = useRef(0);
  /** Evita poll paralelo (reconcile lento + interval). */
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    prefsRef.current = loadNotificationPrefs();
    authDeadRef.current = false;
    authFailCountRef.current = 0;
    bootstrappedRef.current = false;
    void resolveNotificationIconAsync();
    primeCashRegisterSound();
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
        const json = (await res.json()) as MeUser & { user?: MeUser };
        const roles = json.roles ?? json.user?.roles;
        isStaffRef.current = isStaffRoles(roles);
      } catch {
        isStaffRef.current = false;
      } finally {
        roleReadyRef.current = true;
      }
    }

    /**
     * Processa lote de transações.
     * 1º ciclo: só seed (não notifica o que já existia).
     * Próximos: emite gerada/aprovada só para IDs novos (claim global).
     */
    function handleBatch(items: PollTx[], mode: "seller" | "admin") {
      if (!items.length) {
        bootstrappedRef.current = true;
        return;
      }

      const pending = items.filter((t) => isPendingSale(t, mode));
      const paid = items.filter((t) => isPaidSale(t, mode));

      if (!bootstrappedRef.current) {
        for (const t of pending) {
          markSaleNotificationSeen("gerada", {
            id: t.id,
            aliasIds: aliasIdsFor(t),
          });
        }
        for (const t of paid) {
          // Pago já existente: marca gerada+aprovada pra não “acordar” com cha-ching
          markSaleNotificationSeen("gerada", {
            id: t.id,
            aliasIds: aliasIdsFor(t),
          });
          markSaleNotificationSeen("aprovada", {
            id: t.id,
            aliasIds: aliasIdsFor(t),
          });
        }
        bootstrappedRef.current = true;
        return;
      }

      // Geradas: qualquer pendente nova na página (não só items[0])
      for (const t of pending) {
        emitSaleEvent({
          kind: "gerada",
          amount: t.amount,
          customer: t.customer || t.userName || t.description || undefined,
          product: t.product || t.description,
          id: t.id,
          aliasIds: aliasIdsFor(t),
        });
      }

      // Aprovadas: qualquer paga nova
      for (const t of paid) {
        // Se a TX nunca passou por “gerada” neste browser, marca gerada
        // para não disparar gerada depois se status oscilar na listagem
        markSaleNotificationSeen("gerada", {
          id: t.id,
          aliasIds: aliasIdsFor(t),
        });
        emitSaleEvent({
          kind: "aprovada",
          amount: t.amount,
          customer: t.customer || t.userName || t.description || undefined,
          product: t.product || t.description,
          id: t.id,
          aliasIds: aliasIdsFor(t),
        });
      }
    }

    async function pollTransactions() {
      if (!roleReadyRef.current || authDeadRef.current) return;
      if (pollInFlightRef.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }
      pollInFlightRef.current = true;
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
          if (!json.ledger?.length) {
            bootstrappedRef.current = true;
            return;
          }
          handleBatch(json.ledger, "admin");
          return;
        }

        const res = await authedFetch(
          `/api/v1/transactions?pageSize=15&page=1`
        );
        if (!res.ok) {
          markAuthFail(res.status);
          return;
        }
        markAuthOk();
        const json = (await res.json()) as { items?: PollTx[] };
        if (!json.items?.length) {
          bootstrappedRef.current = true;
          return;
        }
        handleBatch(json.items, "seller");
      } catch {
        // polling silencioso
      } finally {
        pollInFlightRef.current = false;
      }
    }

    void resolveRole().then(() => {
      pollTransactions();
    });

    const pollTimer = setInterval(pollTransactions, POLL_INTERVAL_MS);

    // Outra aba marcou seen → só recarrega prefs (claim já está no localStorage)
    function onStorage(e: StorageEvent) {
      if (e.key === "darkpay.notifications.v1") {
        prefsRef.current = loadNotificationPrefs();
      }
    }
    window.addEventListener("storage", onStorage);

    window.addEventListener("darkpay:notifications", onPrefs);
    window.addEventListener("darkpay:sale", onSale);
    return () => {
      clearInterval(pollTimer);
      for (const ev of unlockEvents) {
        window.removeEventListener(ev, unlockOnce, true);
      }
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("darkpay:notifications", onPrefs);
      window.removeEventListener("darkpay:sale", onSale);
    };
  }, []);

  return <>{children}</>;
}
