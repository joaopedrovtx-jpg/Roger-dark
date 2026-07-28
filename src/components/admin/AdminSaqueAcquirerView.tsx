"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBRL } from "@/lib/format";
import type { Adquirente } from "@/lib/mock/admin";

/** Alinhado a schemas + withdrawal.service (Saque mínimo: R$ 5,00) */
export const SAQUE_MINIMO_REAIS = 5;

/**
 * Custo de PIX out cobrado pela adquirente (referência no painel).
 * Velana: R$ 2,00 por saque.
 */
function payoutFeeLabel(a: Adquirente): string {
  const id = String(a.id || "").toLowerCase();
  const code = String(a.code || "").toLowerCase();
  if (id === "velana" || code === "velana") {
    return formatBRL(2);
  }
  if (a.feeFixed > 0 && a.feePercent <= 0) {
    return formatBRL(a.feeFixed);
  }
  if (a.feePercent > 0) {
    const fixed = a.feeFixed > 0 ? ` + ${formatBRL(a.feeFixed)}` : "";
    return `${a.feePercent}%${fixed}`;
  }
  return "—";
}

/**
 * Switch: ativo = fundo escuro + bolinha branca
 *         off  = fundo branco + bolinha escura
 */
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
        /* ON: fundo escuro · OFF: fundo branco */
        background: on ? "var(--bg-card)" : "#ffffff",
        boxShadow: on
          ? "inset 0 0 0 1px var(--border-card)"
          : "0 1px 2px rgba(0,0,0,0.12)",
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
          /* ON: bolinha branca · OFF: bolinha escura */
          background: on ? "#ffffff" : "var(--bg-card)",
          transition: "left 0.18s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
        }}
      />
    </button>
  );
}

/**
 * Admin → Adquirentes → Saque
 * Card enxuto: nome | taxa de saque | switch à direita
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

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-card)",
    borderRadius: "var(--radius-md)",
    padding: "12px 16px",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr) auto",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
  };

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <p
        style={{
          margin: 0,
          fontSize: 12.5,
          color: "var(--text-3)",
        }}
      >
        Mínimo de saque {formatBRL(SAQUE_MINIMO_REAIS)}
      </p>

      {err ? (
        <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{err}</p>
      ) : null}
      {msg ? (
        <p style={{ margin: 0, fontSize: 13, color: "#22c55e" }}>{msg}</p>
      ) : null}

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
            <div key={a.id} style={cardStyle}>
              {/* Col 1: nome */}
              <span
                className="font-medium truncate"
                style={{ fontSize: 14, color: "var(--text-1)" }}
              >
                {a.name}
              </span>

              {/* Col 2: taxa de saque */}
              <span
                className="tabular"
                style={{
                  fontSize: 13,
                  color: "var(--text-2)",
                  textAlign: "left",
                }}
              >
                Taxa de saque {payoutFeeLabel(a)}
              </span>

              {/* Col 3: switch à direita */}
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
            </div>
          );
        })
      )}
    </div>
  );
}
