"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { IconBellFilled } from "@/components/dashboard/KpiIcons";
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPermission,
  isNotificationApiSupported,
  loadNotificationPrefs,
  requestNotificationPermission,
  saveNotificationPrefs,
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

/** Card simples: só o nome + switch (sem preview / sticky com valor) */
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
  const [toast, setToast] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);

  const refreshPermission = useCallback(() => {
    setPermission(getNotificationPermission());
  }, []);

  useEffect(() => {
    setPrefs(loadNotificationPrefs());
    setSupported(isNotificationApiSupported());
    refreshPermission();
    setHydrated(true);
  }, [refreshPermission]);

  function flash(text: string, error = false) {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 2800);
  }

  function persist(next: NotificationPrefs) {
    setPrefs(next);
    saveNotificationPrefs(next);
  }

  async function handleMaster(next: boolean) {
    if (!next) {
      persist({ ...prefs, browserEnabled: false });
      flash("Notificações desligadas");
      return;
    }

    if (!isNotificationApiSupported()) {
      flash("Navegador sem suporte a notificações", true);
      return;
    }

    let perm = getNotificationPermission();
    if (perm === "default") {
      perm = await requestNotificationPermission();
      setPermission(perm);
    } else {
      setPermission(perm);
    }

    if (perm !== "granted") {
      flash(
        perm === "denied"
          ? "Permissão bloqueada no navegador"
          : "Permita as notificações quando o Safari pedir",
        true
      );
      persist({ ...prefs, browserEnabled: false });
      return;
    }

    persist({ ...prefs, browserEnabled: true });
    flash("Notificações ativas no Mac");
  }

  function handleType(
    key: "vendaGerada" | "vendaAprovada",
    next: boolean
  ) {
    if (!prefs.browserEnabled) return;
    persist({ ...prefs, [key]: next });
  }

  const masterOn = prefs.browserEnabled && permission === "granted";
  const typesLocked = !prefs.browserEnabled || !supported;

  /** Badge no mesmo estilo do status do seller (Admin → foto + Ativo/Aprovado) */
  let statusLabel = "Desligado";
  let badgeBg = "var(--bg-elevated)";
  let badgeColor = "var(--text-2)";
  if (!hydrated) {
    statusLabel = "…";
  } else if (!supported) {
    statusLabel = "Indisponível";
    badgeBg = "#ef4444";
    badgeColor = "#ffffff";
  } else if (permission === "denied") {
    statusLabel = "Bloqueado";
    badgeBg = "#ef4444";
    badgeColor = "#ffffff";
  } else if (masterOn) {
    statusLabel = "Ativo";
    badgeBg = "#ffffff";
    badgeColor = "#0a0f0c";
  } else if (prefs.browserEnabled) {
    statusLabel = "Aguardando";
    badgeBg = "#eab308";
    badgeColor = "#0a0f0c";
  }

  return (
    <div className="flex flex-col" style={{ gap: 16, maxWidth: 520 }}>
      {/* Cabeçalho enxuto */}
      <div className="flex items-center justify-between gap-3">
        <h1
          className="font-bold"
          style={{ fontSize: 22, color: "var(--text-1)", margin: 0 }}
        >
          Notificações
        </h1>
        <span
          className="inline-flex items-center justify-center font-semibold shrink-0"
          style={{
            height: 24,
            padding: "0 9px",
            borderRadius: 8,
            background: badgeBg,
            color: badgeColor,
            fontSize: 11,
            lineHeight: 1,
            letterSpacing: "0.01em",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
          suppressHydrationWarning
        >
          {statusLabel}
        </span>
      </div>

      {/* Master — card grande e interativo */}
      <div
        role="button"
        tabIndex={!supported && hydrated ? -1 : 0}
        aria-pressed={prefs.browserEnabled}
        onClick={() => {
          if (!supported && hydrated) return;
          void handleMaster(!prefs.browserEnabled);
        }}
        onKeyDown={(e) => {
          if (!supported && hydrated) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void handleMaster(!prefs.browserEnabled);
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
          cursor: !supported && hydrated ? "not-allowed" : "pointer",
          boxSizing: "border-box",
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
            Alertas no Mac
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--text-3)",
              marginTop: 3,
            }}
          >
            {masterOn
              ? "Ligado — toque para desligar"
              : "Desligado — toque para ligar"}
          </div>
        </div>
        <Switch
          id="notif-master"
          aria-label="Alertas no Mac"
          checked={prefs.browserEnabled}
          disabled={!supported && hydrated}
          onChange={(v) => void handleMaster(v)}
        />
      </div>

      {/* Tipos — só o nome (sem preview de valor) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <OptionCard
          id="notif-aprovada"
          title="Venda aprovada"
          checked={prefs.vendaAprovada && prefs.browserEnabled}
          disabled={typesLocked}
          onChange={(v) => handleType("vendaAprovada", v)}
        />
        <OptionCard
          id="notif-gerada"
          title="Venda gerada"
          checked={prefs.vendaGerada && prefs.browserEnabled}
          disabled={typesLocked}
          onChange={(v) => handleType("vendaGerada", v)}
        />
      </div>

      {/* Feedback curto */}
      {toast ? (
        <div
          role="status"
          className="flex items-center gap-2"
          style={{
            padding: "11px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-card)",
            border: "1px solid var(--border-card)",
            fontSize: 13,
            color: toast.error ? "#f87171" : "var(--text-1)",
          }}
        >
          {toast.error ? (
            <X size={15} strokeWidth={2.25} style={{ color: "#f87171" }} />
          ) : (
            <Check
              size={15}
              strokeWidth={2.25}
              style={{ color: "var(--green-use)" }}
            />
          )}
          {toast.text}
        </div>
      ) : null}

      {hydrated && permission === "denied" ? (
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: "#f87171",
            lineHeight: 1.4,
          }}
        >
          Bloqueado no Safari. Cadeado da URL → Notificações → Permitir.
        </p>
      ) : null}
    </div>
  );
}
