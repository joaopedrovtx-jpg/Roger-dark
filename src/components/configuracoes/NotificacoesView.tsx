"use client";

import { useCallback, useEffect, useState } from "react";
import { IconBellFilled } from "@/components/dashboard/KpiIcons";
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPermission,
  isNotificationApiSupported,
  loadNotificationPrefs,
  requestNotificationPermission,
  saveNotificationPrefs,
  unlockNotificationAudio,
  type NotificationPrefs,
} from "@/lib/notifications";

function Switch({
  checked,
  onChange,
  disabled,
  id,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id: string;
  "aria-label": string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className="relative shrink-0"
      style={{
        width: 48,
        height: 28,
        borderRadius: 999,
        border: "none",
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--green-use)" : "var(--bg-elevated)",
        boxShadow: checked ? "none" : "inset 0 0 0 1px var(--border-muted)",
        opacity: disabled ? 0.4 : 1,
        transition: "background 160ms ease, opacity 160ms ease",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 22 : 3,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: checked ? "#0a0f0c" : "var(--text-2)",
          transition: "left 160ms ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        }}
      />
    </button>
  );
}

/** Card simples: só o nome + switch */
function OptionCard({
  id,
  title,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      id={id}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-pressed={checked}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      className="w-full text-left transition-opacity"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: "var(--radius-card)",
        border: "1px solid var(--border-card)",
        background: "var(--bg-card)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        boxSizing: "border-box",
      }}
    >
      <span
        className="min-w-0 flex-1 font-semibold"
        style={{ fontSize: 14, color: "var(--text-1)" }}
      >
        {title}
      </span>
      <Switch
        id={`${id}-switch`}
        aria-label={title}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

export function NotificacoesView() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => ({
    ...DEFAULT_NOTIFICATION_PREFS,
  }));
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [supported, setSupported] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshPermission = useCallback(() => {
    setPermission(getNotificationPermission());
  }, []);

  useEffect(() => {
    const loaded = loadNotificationPrefs();
    const perm = getNotificationPermission();
    const apiOk = isNotificationApiSupported();

    // Se o browser ainda não autorizou, não mantém “ligado” no storage
    if (perm !== "granted" && loaded.browserEnabled) {
      loaded.browserEnabled = false;
      saveNotificationPrefs(loaded);
    }

    setPrefs(loaded);
    setSupported(apiOk);
    setPermission(perm);
    setHydrated(true);
  }, []);

  // Atualiza se o usuário mudar a permissão nas configs do browser e voltar
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") {
        refreshPermission();
        const perm = getNotificationPermission();
        if (perm !== "granted") {
          setPrefs((prev) => {
            if (!prev.browserEnabled) return prev;
            const next = { ...prev, browserEnabled: false };
            saveNotificationPrefs(next);
            return next;
          });
        }
      }
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [refreshPermission]);

  function persist(next: NotificationPrefs) {
    setPrefs(next);
    saveNotificationPrefs(next);
  }

  /**
   * Liga/desliga. Ao ligar, SEMPRE aciona o pedido nativo do navegador
   * (Notification.requestPermission) a partir do clique do usuário.
   */
  async function handleMaster(wantOn: boolean) {
    if (busy) return;

    // Desligar: só preferência local
    if (!wantOn) {
      persist({ ...prefs, browserEnabled: false });
      return;
    }

    if (!isNotificationApiSupported()) {
      persist({ ...prefs, browserEnabled: false });
      setPermission("unsupported");
      return;
    }

    setBusy(true);
    try {
      // Desbloqueia som (caixa registradora) no mesmo gesto do clique
      unlockNotificationAudio();

      // 1) Chama o browser AGORA (gesto do clique) → popup Permitir / Bloquear
      const perm = await requestNotificationPermission();
      setPermission(perm);

      // 2) Só fica Ativo se o usuário/navegador autorizou
      if (perm === "granted") {
        persist({ ...prefs, browserEnabled: true });
      } else {
        persist({ ...prefs, browserEnabled: false });
      }
    } finally {
      setBusy(false);
    }
  }

  function handleType(
    key: "vendaGerada" | "vendaAprovada",
    next: boolean
  ) {
    if (!prefs.browserEnabled || permission !== "granted") return;
    persist({ ...prefs, [key]: next });
  }

  // Ligado de verdade = preferência + permissão do browser
  const masterOn = prefs.browserEnabled && permission === "granted";
  const typesLocked = !masterOn || !supported;

  return (
    <div className="flex flex-col" style={{ gap: 16, maxWidth: 520 }}>
      <div className="flex items-center justify-between gap-3">
        <h1
          className="font-bold"
          style={{ fontSize: 22, color: "var(--text-1)", margin: 0 }}
        >
          Notificações
        </h1>
        {hydrated && masterOn ? (
          <span
            className="inline-flex items-center justify-center font-semibold shrink-0"
            style={{
              height: 24,
              padding: "0 9px",
              borderRadius: 8,
              background: "#ffffff",
              color: "#0a0f0c",
              fontSize: 11,
              lineHeight: 1,
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}
          >
            Ativo
          </span>
        ) : null}
      </div>

      {/* Clique no card ou no switch → pede autorização nativa do navegador */}
      <div
        role="button"
        tabIndex={busy || (!supported && hydrated) ? -1 : 0}
        aria-pressed={masterOn}
        aria-disabled={busy || (!supported && hydrated) || undefined}
        onClick={() => {
          if (busy || (!supported && hydrated)) return;
          void handleMaster(!masterOn);
        }}
        onKeyDown={(e) => {
          if (busy || (!supported && hydrated)) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void handleMaster(!masterOn);
          }
        }}
        className="w-full text-left"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "18px 18px",
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--border-card)",
          background: "var(--bg-card)",
          cursor:
            busy || (!supported && hydrated) ? "not-allowed" : "pointer",
          boxSizing: "border-box",
          opacity: busy ? 0.75 : 1,
        }}
      >
        <span
          className="flex shrink-0 items-center justify-center"
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: "var(--bg-card-inner-icon)",
          }}
        >
          <IconBellFilled size={24} tone="white" />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="font-semibold"
            style={{ fontSize: 15.5, color: "var(--text-1)" }}
          >
            Receba notificação de venda
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-3)",
              marginTop: 3,
              lineHeight: 1.4,
            }}
          >
            {masterOn ? "Toque para desligar" : "Toque para ativar"}
          </div>
        </div>
        <Switch
          id="notif-master"
          aria-label="Receba notificação de venda"
          checked={masterOn}
          disabled={busy || (!supported && hydrated)}
          onChange={(v) => void handleMaster(v)}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--text-3)",
            fontWeight: 500,
          }}
        >
          Tipos de notificação
        </p>
        <OptionCard
          id="notif-aprovada"
          title="Venda aprovada"
          checked={prefs.vendaAprovada && masterOn}
          disabled={typesLocked}
          onChange={(v) => handleType("vendaAprovada", v)}
        />
        <OptionCard
          id="notif-gerada"
          title="Venda gerada"
          checked={prefs.vendaGerada && masterOn}
          disabled={typesLocked}
          onChange={(v) => handleType("vendaGerada", v)}
        />
      </div>
    </div>
  );
}
