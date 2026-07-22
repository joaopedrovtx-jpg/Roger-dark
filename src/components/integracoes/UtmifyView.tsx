"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { authedFetch } from "@/lib/client/session";
import { formatDateTime } from "@/lib/format";

interface UtmifyConnection {
  active: boolean;
  hasToken: boolean;
  tokenMasked: string | null;
  connectedAt: string | null;
}

/** Mesmos tamanhos das ações de API / Webhooks */
const ACTION_ICON = 18;
const ACTION_BTN = 36;
/** PNG preto → ícone preto sólido (botão branco) */
const FILTER_ICON_BLACK = "brightness(0) saturate(100%)";

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
  fontFamily: "inherit",
};



/**
 * UTMify: 1 token por conta.
 * - Sem token: campo + Salvar
 * - Com token: só Token ativo + lixeira (remove)
 */
export function UtmifyView() {
  const [hydrated, setHydrated] = useState(false);
  const [connection, setConnection] = useState<UtmifyConnection | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/v1/integrations/utmify");
      if (!res.ok) return;
      const json = (await res.json()) as { connection?: UtmifyConnection };
      if (json.connection) setConnection(json.connection);
    } catch {
      /* ignore */
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: FormEvent) {
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
    setInfo(null);
    setSaving(true);
    try {
      const res = await authedFetch("/api/v1/integrations/utmify", {
        method: "PUT",
        body: JSON.stringify({ apiToken: value }),
      });
      const json = (await res.json()) as {
        error?: string;
        detail?: string;
        connection?: UtmifyConnection;
      };
      if (!res.ok) {
        setError(json.error || json.detail || "Não foi possível salvar o token.");
        return;
      }
      if (json.connection) setConnection(json.connection);
      setToken("");
      setInfo(null);
    } catch {
      setError("Falha de rede ao salvar o token.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!confirm("Remover o token UTMify desta conta?")) return;
    setError(null);
    setInfo(null);
    setSaving(true);
    try {
      const res = await authedFetch("/api/v1/integrations/utmify", {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Não foi possível remover o token.");
        return;
      }
      setConnection({
        active: false,
        hasToken: false,
        tokenMasked: null,
        connectedAt: null,
      });
      setToken("");
    } catch {
      setError("Falha de rede ao remover o token.");
    } finally {
      setSaving(false);
    }
  }

  /** Com token salvo: nunca mostra campo para “mais um” — só o ativo + lixeira */
  const hasToken = Boolean(connection?.hasToken);
  const connected = Boolean(connection?.active && connection?.hasToken);

  return (
    <div className="flex flex-col" style={{ gap: 18, maxWidth: 680 }}>
      <section
        className="surface-card flex flex-col"
        style={{
          padding: "22px 22px 20px",
          borderRadius: "var(--radius-card)",
          gap: 18,
        }}
      >
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
                style={{ margin: 0, fontSize: 18, color: "var(--text-1)" }}
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
              Rastreie vendas Dark Pay na UTMify (Meta Ads / Pixel / campanhas).
              Cole o Token de API da sua conta em{" "}
              <a
                href="https://app.utmify.com.br"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--text-1)", fontWeight: 600 }}
              >
                app.utmify.com.br
              </a>
              .
            </p>
          </div>
        </div>

        {/* 1 token por conta: com token → só exibe + lixeira; sem token → formulário */}
        {hasToken && connection ? (
          <div
            className="flex items-center gap-3"
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-app)",
              border: "1px solid var(--border-card)",
            }}
          >
            <div className="min-w-0 flex-1">
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-3)" }}>
                Token ativo
              </p>
              <p
                className="tabular"
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-1)",
                  wordBreak: "break-all",
                }}
              >
                {connection.tokenMasked || "••••••••"}
              </p>
              {connection.connectedAt ? (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 12,
                    color: "var(--text-3)",
                  }}
                >
                  Conectado em {formatDateTime(connection.connectedAt)}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={saving}
              aria-label="Remover token"
              title="Remover token"
              className="flex shrink-0 items-center justify-center transition-opacity hover:opacity-90"
              style={{
                width: ACTION_BTN,
                height: ACTION_BTN,
                borderRadius: "var(--radius-md)",
                border: "none",
                backgroundColor: "#ffffff",
                background: "#ffffff",
                color: "#0a0f0c",
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.6 : 1,
                padding: 0,
                flexShrink: 0,
              }}
            >
              {/* Mesmo ícone Flaticon das credenciais API / webhooks */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icons/lixeira.png"
                alt=""
                width={ACTION_ICON}
                height={ACTION_ICON}
                aria-hidden
                style={{
                  width: ACTION_ICON,
                  height: ACTION_ICON,
                  objectFit: "contain",
                  filter: FILTER_ICON_BLACK,
                  display: "block",
                }}
              />
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSave}
            className="flex flex-col"
            style={{ gap: 14 }}
          >
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
            {info ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "var(--text-2)",
                  lineHeight: 1.4,
                }}
              >
                {info}
              </p>
            ) : null}

            <div className="flex items-center">
              <button
                type="submit"
                disabled={saving || !token.trim()}
                className="inline-flex items-center justify-center transition-opacity hover:opacity-90"
                style={{
                  ...btnPrimary,
                  opacity: saving || !token.trim() ? 0.55 : 1,
                  cursor:
                    saving || !token.trim() ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        )}

        {hasToken && error ? (
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
      </section>
    </div>
  );
}
