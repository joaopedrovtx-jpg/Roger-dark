"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBRL } from "@/lib/format";
import type { Adquirente } from "@/lib/mock/admin";

/** Alinhado a schemas + withdrawal.service (Saque mínimo: R$ 5,00) */
export const SAQUE_MINIMO_REAIS = 5;

/**
 * Custo de PIX out cobrado pela adquirente (referência no painel).
 * Velana: R$ 2,00 por saque (pedido do produto).
 */
function payoutFeeLabel(a: Adquirente): string {
  const id = String(a.id || "").toLowerCase();
  const code = String(a.code || "").toLowerCase();
  if (id === "velana" || code === "velana") {
    return `${formatBRL(2)} / saque`;
  }
  // Outras: se tiver taxa fixa cadastrada, mostra; senão —
  if (a.feeFixed > 0 && a.feePercent <= 0) {
    return `${formatBRL(a.feeFixed)} / saque`;
  }
  if (a.feePercent > 0) {
    const fixed = a.feeFixed > 0 ? ` + ${formatBRL(a.feeFixed)}` : "";
    return `${a.feePercent}%${fixed}`;
  }
  return "—";
}

/** Switch Ativar/Desativar (mesmo padrão Usuários → Adquirentes) */
function ToggleSwitch({
  on,
  onToggle,
  disabled,
  ariaLabel,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className="relative shrink-0 transition-colors"
      style={{
        width: 46,
        height: 26,
        borderRadius: 999,
        border: "none",
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        background: on ? "#ffffff" : "var(--bg-elevated)",
        boxShadow: on ? "none" : "inset 0 0 0 1px var(--border-card)",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: on ? "var(--bg-card)" : "#ffffff",
          transition: "left 0.18s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
        }}
      />
    </button>
  );
}

/**
 * Admin → Adquirentes → Saque
 * UI enxuta: switch + nome + taxa + mínimo global.
 */
export function AdminSaqueAcquirerView() {
  const [items, setItems] = useState<Adquirente[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch("/api/v1/admin/acquirers");
      const json = (await res.json()) as {
        items?: Adquirente[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Falha ao carregar");
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const payoutPrimary = items.find((a) => a.isPayoutPrimary) || null;

  async function setPayoutPrimary(id: string, enable: boolean) {
    setSavingId(id);
    setMsg(null);
    setErr(null);
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch(
        `/api/v1/admin/acquirers/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(
            enable
              ? { setPayoutPrimary: true }
              : { clearPayoutPrimary: true }
          ),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao salvar");
      await reload();
      setMsg(enable ? "Ativa para saque." : "Saque desativado nesta adquirente.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingId(null);
    }
  }

  const fieldShell: React.CSSProperties = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-card)",
    borderRadius: "var(--radius-md)",
    padding: "10px 14px",
  };

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {/* Resumo mínimo — sem texto longo */}
      <div
        className="flex flex-wrap items-center gap-3"
        style={{
          ...fieldShell,
          minHeight: 48,
        }}
      >
        <div className="flex flex-col min-w-0" style={{ gap: 2, flex: 1 }}>
          <span
            className="font-semibold"
            style={{ fontSize: 14, color: "var(--text-1)" }}
          >
            Adquirente de saque
          </span>
          <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            Mínimo de saque {formatBRL(SAQUE_MINIMO_REAIS)}
            {payoutPrimary
              ? ` · Ativa: ${payoutPrimary.name}`
              : " · Nenhuma ativa"}
          </span>
        </div>
      </div>

      {err ? (
        <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{err}</p>
      ) : null}
      {msg ? (
        <p style={{ margin: 0, fontSize: 13, color: "#22c55e" }}>{msg}</p>
      ) : null}

      {/* Lista estilo Usuários → Adquirentes (switch + nome) */}
      <div className="flex flex-col" style={{ gap: 10 }}>
        {loading ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--text-3)",
              textAlign: "center",
              padding: 24,
            }}
          >
            Carregando…
          </p>
        ) : items.length === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "var(--text-3)",
              textAlign: "center",
              padding: 24,
            }}
          >
            Nenhuma adquirente cadastrada
          </p>
        ) : (
          items.map((a) => {
            const on = !!a.isPayoutPrimary;
            const busy = savingId === a.id;
            const hasKey = !!a.hasPrivateKey;
            const canEnable = hasKey || on;
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 w-full"
                style={{
                  ...fieldShell,
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: 52,
                }}
              >
                <ToggleSwitch
                  on={on}
                  disabled={busy || !canEnable}
                  onToggle={() => void setPayoutPrimary(a.id, !on)}
                  ariaLabel={
                    on
                      ? `Desativar ${a.name} para saque`
                      : `Ativar ${a.name} para saque`
                  }
                />
                <div className="flex flex-col min-w-0 flex-1" style={{ gap: 2 }}>
                  <span
                    className="font-medium truncate"
                    style={{ fontSize: 14, color: "var(--text-1)" }}
                  >
                    {a.name}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--text-3)",
                      }}
                    >
                      {a.code}
                    </span>
                  </span>
                  <span
                    className="tabular"
                    style={{ fontSize: 12, color: "var(--text-3)" }}
                  >
                    Taxa saque {payoutFeeLabel(a)}
                    {!hasKey ? " · Sem chave" : ""}
                  </span>
                </div>
                {on ? (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#0a0f0c",
                      background: "#ffffff",
                      borderRadius: 8,
                      padding: "2px 7px",
                      flexShrink: 0,
                    }}
                  >
                    Ativa para saque
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
