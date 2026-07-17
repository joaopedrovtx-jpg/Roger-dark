"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import { Check, Copy, X } from "lucide-react";
import { Icon2FAFilled } from "@/components/dashboard/KpiIcons";
import { useAuth } from "@/components/auth/AuthProvider";

const btnPrimary: CSSProperties = {
  height: 42,
  padding: "0 20px",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "#ffffff",
  color: "#0a0f0c",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost: CSSProperties = {
  height: 42,
  padding: "0 18px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-muted)",
  background: "var(--bg-elevated)",
  color: "var(--text-1)",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
};

const fieldInput: CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-card)",
  background: "var(--bg-app)",
  color: "var(--text-1)",
  fontSize: 15,
  fontWeight: 600,
  outline: "none",
  fontFamily: "inherit",
  letterSpacing: "0.12em",
  textAlign: "center",
  boxSizing: "border-box",
};

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

type SetupPhase = "idle" | "setup" | "codes" | "disable";

export function SegurancaView() {
  const { user, refresh } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [enabledAt, setEnabledAt] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<SetupPhase>("idle");
  const [setupSecret, setSetupSecret] = useState("");
  const [setupBackup, setSetupBackup] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null
  );
  const [copied, setCopied] = useState<"secret" | "codes" | null>(null);
  const [busy, setBusy] = useState(false);
  const formId = useId();

  function flash(text: string, isError = false) {
    setToast({ text, error: isError });
    window.setTimeout(() => setToast(null), 2800);
  }

  useEffect(() => {
    // Fonte da verdade: API MySQL (sem localStorage mock)
    void (async () => {
      try {
        const res = await fetch("/api/v1/auth/2fa", { credentials: "include" });
        if (res.ok) {
          const json = (await res.json()) as {
            enabled?: boolean;
            enabledAt?: string | null;
          };
          setEnabled(!!json.enabled);
          setEnabledAt(json.enabledAt ?? null);
        } else if (user?.twoFactorEnabled) {
          setEnabled(true);
        }
      } catch {
        if (user?.twoFactorEnabled) setEnabled(true);
      } finally {
        setHydrated(true);
      }
    })();
  }, [user?.twoFactorEnabled]);

  async function startEnable() {
    setCode("");
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/2fa", { credentials: "include" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        flash(err.error || "Não foi possível iniciar o 2FA. Faça login de novo.", true);
        return;
      }
      const json = (await res.json()) as {
        secret?: string;
        enabled?: boolean;
      };
      if (json.enabled) {
        setEnabled(true);
        flash("2FA já está ativo");
        return;
      }
      if (!json.secret) {
        flash("Servidor não devolveu secret TOTP. Verifique o MySQL.", true);
        return;
      }
      setSetupSecret(json.secret);
      setSetupBackup([]);
      setPhase("setup");
    } catch {
      flash("Falha de rede ao iniciar 2FA.", true);
    } finally {
      setBusy(false);
    }
  }

  function startDisable() {
    setCode("");
    setError(null);
    setPhase("disable");
  }

  function cancelFlow() {
    setPhase("idle");
    setCode("");
    setError(null);
    setSetupSecret("");
    setSetupBackup([]);
  }

  async function confirmEnable() {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Informe o código de 6 dígitos do app.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/2fa", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable", token: digits }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        backupCodes?: string[];
      };
      if (!res.ok) {
        setError(json.error || "Código inválido. Tente novamente.");
        return;
      }
      const codes = json.backupCodes ?? [];
      setSetupBackup(codes);
      setEnabled(true);
      setEnabledAt(new Date().toISOString());
      setCode("");
      setError(null);
      setSetupSecret("");
      flash("Verificação em duas etapas ativada");
      void refresh();
      setPhase(codes.length ? "codes" : "idle");
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDisable() {
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Informe o código de 6 dígitos do app.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/2fa", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable", token: digits }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Não foi possível desativar o 2FA.");
        return;
      }
      setEnabled(false);
      setEnabledAt(null);
      setPhase("idle");
      setCode("");
      setError(null);
      setSetupSecret("");
      setSetupBackup([]);
      flash("Verificação em duas etapas desativada");
      void refresh();
    } catch {
      setError("Falha de rede. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string, kind: "secret" | "codes") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      flash("Não foi possível copiar", true);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 16, maxWidth: 560 }}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <h1
          className="font-bold"
          style={{ fontSize: 22, color: "var(--text-1)", margin: 0 }}
        >
          Segurança
        </h1>
        {hydrated ? (
          <span
            className="inline-flex items-center justify-center font-semibold shrink-0"
            style={{
              height: 24,
              padding: "0 9px",
              borderRadius: 8,
              background: enabled ? "#ffffff" : "var(--bg-elevated)",
              color: enabled ? "#0a0f0c" : "var(--text-2)",
              fontSize: 11,
              lineHeight: 1,
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}
          >
            {enabled ? "2FA ativo" : "2FA off"}
          </span>
        ) : null}
      </div>

      {user?.mustSetup2fa ||
      (user?.roles?.includes("admin") && !enabled && !user?.twoFactorEnabled) ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            background: "rgba(251, 191, 36, 0.1)",
            border: "1px solid rgba(251, 191, 36, 0.35)",
            fontSize: 13,
            color: "var(--text-1)",
            lineHeight: 1.45,
          }}
        >
          <strong>Conta admin:</strong> a verificação em duas etapas é
          obrigatória em produção. Ative o autenticador abaixo para liberar o
          painel administrativo.
        </div>
      ) : null}

      {/* Card principal 2FA */}
      <div
        className="surface-card"
        style={{
          padding: "18px 18px",
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--border-card)",
        }}
      >
        <div
          className="flex items-center gap-4"
          style={{ marginBottom: phase === "idle" ? 0 : 18 }}
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
            <Icon2FAFilled size={24} tone="white" />
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="font-semibold"
              style={{ fontSize: 15.5, color: "var(--text-1)" }}
            >
              Verificação em duas etapas
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--text-3)",
                marginTop: 3,
                lineHeight: 1.45,
              }}
            >
              {enabled
                ? "Sua conta pede um código do app autenticador no login."
                : "Proteja a conta com um código do Google Authenticator ou similar."}
            </div>
          </div>
          {phase === "idle" ? (
            <Switch
              id="switch-2fa"
              aria-label="Verificação em duas etapas"
              checked={enabled}
              onChange={(next) => {
                if (next) startEnable();
                else startDisable();
              }}
            />
          ) : null}
        </div>

        {/* Fluxo ativar */}
        {phase === "setup" ? (
          <div className="flex flex-col" style={{ gap: 16 }}>
            <ol
              className="flex flex-col"
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                gap: 12,
              }}
            >
              <Step n="1" title="Instale um app autenticador">
                Google Authenticator, Authy ou Microsoft Authenticator.
              </Step>
              <Step n="2" title="Adicione esta conta no app">
                Digite a chave TOTP real gerada pelo servidor (otplib).
              </Step>
              <Step n="3" title="Confirme com o código de 6 dígitos">
                O app gera um código novo a cada ~30 segundos.
              </Step>
            </ol>

            {/* Chave secreta real */}
            {setupSecret ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-card)",
                }}
              >
                <div
                  className="flex items-center justify-between gap-2"
                  style={{ marginBottom: 8 }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-3)",
                    }}
                  >
                    Chave TOTP (manual)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      copyText(setupSecret.replace(/\s/g, ""), "secret")
                    }
                    className="inline-flex items-center gap-1.5 font-semibold"
                    style={{
                      height: 30,
                      padding: "0 10px",
                      borderRadius: "var(--radius-md)",
                      border: "none",
                      background: "#ffffff",
                      color: "#0a0f0c",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {copied === "secret" ? (
                      <Check size={13} strokeWidth={2.5} />
                    ) : (
                      <Copy size={13} strokeWidth={2} />
                    )}
                    {copied === "secret" ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <code
                  className="tabular block"
                  style={{
                    fontSize: 14,
                    fontWeight: 650,
                    color: "var(--text-1)",
                    letterSpacing: "0.06em",
                    wordBreak: "break-all",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  {setupSecret}
                </code>
              </div>
            ) : null}

            <label className="flex flex-col" style={{ gap: 6 }} htmlFor={formId}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-2)",
                }}
              >
                Código do app (6 dígitos)
              </span>
              <input
                id={formId}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                style={fieldInput}
              />
            </label>

            {error ? (
              <p
                role="alert"
                style={{ margin: 0, fontSize: 13, color: "#ef4444" }}
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelFlow}
                style={btnGhost}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmEnable}
                style={{ ...btnPrimary, opacity: busy ? 0.7 : 1 }}
                disabled={busy}
              >
                {busy ? "Validando…" : "Ativar 2FA"}
              </button>
            </div>
          </div>
        ) : null}

        {/* Backup codes — só uma vez após ativar */}
        {phase === "codes" ? (
          <div className="flex flex-col" style={{ gap: 14 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                color: "var(--text-2)",
                lineHeight: 1.45,
              }}
            >
              Guarde estes códigos em local seguro. Eles <strong>não</strong>{" "}
              serão mostrados de novo. Cada um só funciona uma vez.
            </p>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-card)",
              }}
            >
              <div
                className="flex items-center justify-between gap-2"
                style={{ marginBottom: 10 }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-3)",
                  }}
                >
                  Códigos de recuperação
                </span>
                <button
                  type="button"
                  onClick={() => copyText(setupBackup.join("\n"), "codes")}
                  className="inline-flex items-center gap-1.5 font-semibold"
                  style={{
                    height: 30,
                    padding: "0 10px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "#ffffff",
                    color: "#0a0f0c",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {copied === "codes" ? (
                    <Check size={13} strokeWidth={2.5} />
                  ) : (
                    <Copy size={13} strokeWidth={2} />
                  )}
                  {copied === "codes" ? "Copiado" : "Copiar todos"}
                </button>
              </div>
              <div
                className="grid tabular"
                style={{
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-1)",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {setupBackup.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSetupBackup([]);
                  setPhase("idle");
                }}
                style={btnPrimary}
              >
                Já guardei os códigos
              </button>
            </div>
          </div>
        ) : null}

        {/* Fluxo desativar */}
        {phase === "disable" ? (
          <div className="flex flex-col" style={{ gap: 14 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13.5,
                color: "var(--text-2)",
                lineHeight: 1.45,
              }}
            >
              Confirme com o código do app autenticador para desligar a
              verificação em duas etapas.
            </p>
            <label className="flex flex-col" style={{ gap: 6 }} htmlFor={`${formId}-off`}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-2)",
                }}
              >
                Código do app (6 dígitos)
              </span>
              <input
                id={`${formId}-off`}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                style={fieldInput}
              />
            </label>
            {error ? (
              <p
                role="alert"
                style={{ margin: 0, fontSize: 13, color: "#ef4444" }}
              >
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={cancelFlow} style={btnGhost}>
                Cancelar
              </button>
              <button type="button" onClick={confirmDisable} style={btnPrimary}>
                Desativar 2FA
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Dica */}
      {phase === "idle" ? (
        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            color: "var(--text-3)",
            lineHeight: 1.45,
          }}
        >
          Fluxo em mock: qualquer código de 6 dígitos (exceto 000000) confirma a
          ativação ou desativação.
        </p>
      ) : null}

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
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className="flex shrink-0 items-center justify-center font-bold tabular"
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          background: "#ffffff",
          color: "#0a0f0c",
          fontSize: 12,
        }}
      >
        {n}
      </span>
      <div className="min-w-0">
        <div
          className="font-semibold"
          style={{ fontSize: 13.5, color: "var(--text-1)" }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: "var(--text-3)",
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {children}
        </div>
      </div>
    </li>
  );
}
