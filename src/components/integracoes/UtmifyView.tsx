"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";

const STORAGE_KEY = "darkpay.utmify.connection.v1";

interface UtmifyConnection {
  token: string;
  connectedAt: string;
}

const btnPrimary: CSSProperties = {
  height: 42,
  padding: "0 18px",
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

const btnDanger: CSSProperties = {
  height: 42,
  padding: "0 18px",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "#ef4444",
  color: "#ffffff",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-muted)",
  background: "var(--bg-app)",
  color: "var(--text-1)",
  fontSize: 14,
  fontWeight: 500,
  outline: "none",
  boxSizing: "border-box",
  /* mesma fonte do restante do Dark Pay (Inter) */
  fontFamily: "inherit",
};

function loadConnection(): UtmifyConnection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UtmifyConnection;
  } catch {
    return null;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Mascara o token exibindo só o início e o fim */
function maskToken(token: string): string {
  const t = token.trim();
  if (t.length <= 12) return "•".repeat(Math.min(t.length, 8));
  return `${t.slice(0, 6)}${"•".repeat(10)}${t.slice(-4)}`;
}

export function UtmifyView() {
  const [hydrated, setHydrated] = useState(false);
  const [connection, setConnection] = useState<UtmifyConnection | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justConnected, setJustConnected] = useState(false);

  useEffect(() => {
    const saved = loadConnection();
    setConnection(saved);
    if (saved) setToken(saved.token);
    setHydrated(true);
  }, []);

  const persist = useCallback((next: UtmifyConnection | null) => {
    setConnection(next);
    if (next) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  function handleConnect(e: FormEvent) {
    e.preventDefault();
    const value = token.trim();
    if (!value) {
      setError("Informe o Token de API da UTMify.");
      return;
    }
    if (value.length < 8) {
      setError("Token inválido. Verifique o token gerado na UTMify.");
      return;
    }

    setError(null);
    setSaving(true);
    // Mock de conexão via token (persistência local)
    window.setTimeout(() => {
      persist({
        token: value,
        connectedAt: new Date().toISOString(),
      });
      setSaving(false);
      setJustConnected(true);
      window.setTimeout(() => setJustConnected(false), 1800);
    }, 700);
  }

  function handleDisconnect() {
    if (!confirm("Desconectar a integração com a UTMify?")) return;
    persist(null);
    setToken("");
    setError(null);
    setJustConnected(false);
  }

  const connected = Boolean(connection?.token);

  return (
    <div className="flex flex-col" style={{ gap: 18, maxWidth: 640 }}>
      <section
        className="surface-card flex flex-col"
        style={{
          padding: "22px 22px 20px",
          borderRadius: "var(--radius-card)",
          gap: 18,
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-4">
          <span
            className="flex shrink-0 items-center justify-center overflow-hidden"
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--radius-sm)",
              backgroundImage: "url(/icons/utmify-favicon.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1
                className="font-bold"
                style={{
                  margin: 0,
                  fontSize: 18,
                  color: "var(--text-1)",
                }}
              >
                UTMify
              </h1>
              {hydrated ? (
                <span
                  className="inline-flex items-center font-semibold"
                  style={{
                    height: 24,
                    padding: "0 10px",
                    borderRadius: 10,
                    fontSize: 11.5,
                    background: connected ? "#ffffff" : "var(--bg-elevated)",
                    color: connected ? "#0a0f0c" : "var(--text-3)",
                    border: connected
                      ? "none"
                      : "1px solid var(--border-muted)",
                  }}
                >
                  {connected ? "Conectado" : "Desconectado"}
                </span>
              ) : null}
            </div>
            <p
              style={{
                margin: "8px 0 0",
                fontSize: 13.5,
                lineHeight: 1.5,
                color: "var(--text-2)",
              }}
            >
              Conecte sua conta UTMify via Token de API para automatizar o
              rastreamento de campanhas e UTMs nas suas vendas.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleConnect} className="flex flex-col" style={{ gap: 14 }}>
          <label className="flex flex-col gap-1.5">
            <span
              style={{
                fontSize: 13,
                fontWeight: 650,
                color: "var(--text-2)",
              }}
            >
              Token de API
            </span>
            <input
              type="password"
              name="utmify-token"
              autoComplete="off"
              spellCheck={false}
              placeholder="Cole aqui o token gerado na UTMify"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (error) setError(null);
              }}
              style={inputStyle}
              disabled={saving}
            />
            <span style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.4 }}>
              Gere o token no painel da UTMify (Integrações / API) e cole
              acima para conectar.
            </span>
          </label>

          {error ? (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "#f87171",
                lineHeight: 1.4,
              }}
            >
              {error}
            </p>
          ) : null}

          {connected && connection ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-app)",
                border: "1px solid var(--border-card)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: "var(--text-3)",
                }}
              >
                Token ativo
              </p>
              <p
                className="tabular"
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-1)",
                  fontFamily: "inherit",
                  wordBreak: "break-all",
                }}
              >
                {maskToken(connection.token)}
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 12,
                  color: "var(--text-3)",
                }}
              >
                Conectado em {formatDateTime(connection.connectedAt)}
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center transition-opacity hover:opacity-90"
              style={{
                ...btnPrimary,
                opacity: saving ? 0.75 : 1,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {justConnected
                ? "Conectado"
                : saving
                  ? "Conectando…"
                  : connected
                    ? "Atualizar conexão"
                    : "Conectar"}
            </button>

            {connected ? (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={saving}
                className="inline-flex items-center justify-center transition-opacity hover:opacity-90"
                style={btnDanger}
              >
                Desconectar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setToken("");
                  setError(null);
                }}
                disabled={saving || !token}
                className="inline-flex items-center transition-opacity hover:opacity-90"
                style={{
                  ...btnGhost,
                  opacity: !token || saving ? 0.5 : 1,
                  cursor: !token || saving ? "default" : "pointer",
                }}
              >
                Limpar
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
