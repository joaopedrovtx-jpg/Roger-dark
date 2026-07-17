"use client";

import { useEffect, useId, type CSSProperties } from "react";
import { X } from "lucide-react";
import { IconBancoFilled } from "@/components/dashboard/KpiIcons";
import { formatBRL } from "@/lib/format";
import type { Adquirente, AdquirenteStatus } from "@/lib/mock/admin";

interface AdminAdquirenteDetailModalProps {
  adquirente: Adquirente | null;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (id: string, status: AdquirenteStatus) => void;
  onMovePriority?: (id: string, dir: -1 | 1) => void;
  maxPriority?: number;
}

const fieldShell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 14px",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-card)",
  minHeight: 58,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-3)",
  fontWeight: 500,
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-1)",
  fontSize: 14,
  fontWeight: 500,
  padding: 0,
};

const moneyValueStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
  color: "var(--text-1)",
};

const btnBase: CSSProperties = {
  height: 38,
  padding: "0 18px",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

function statusLabel(s: AdquirenteStatus): string {
  if (s === "ativo") return "Ativo";
  if (s === "manutencao") return "Manutenção";
  return "Inativo";
}

function statusBadgeColors(s: AdquirenteStatus): {
  background: string;
  color: string;
} {
  if (s === "ativo") return { background: "#ffffff", color: "#0a0f0c" };
  if (s === "manutencao") return { background: "#eab308", color: "#0a0f0c" };
  return { background: "#6d7585", color: "#ffffff" };
}

function ReadField({
  label,
  value,
  full,
  valueStyle,
}: {
  label: string;
  value: string | undefined | null;
  full?: boolean;
  valueStyle?: CSSProperties;
}) {
  return (
    <label
      style={{
        ...fieldShell,
        ...(full ? { gridColumn: "1 / -1" } : null),
      }}
    >
      <span style={labelStyle}>{label}</span>
      <input
        type="text"
        readOnly
        value={value?.trim() ? value : "—"}
        className={valueStyle ? "tabular" : undefined}
        style={{ ...inputStyle, ...valueStyle }}
        tabIndex={0}
      />
    </label>
  );
}

export function AdminAdquirenteDetailModal({
  adquirente,
  open,
  onClose,
  onStatusChange,
  onMovePriority,
  maxPriority = 1,
}: AdminAdquirenteDetailModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !adquirente) return null;

  const a = adquirente;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 border-0"
        style={{ background: "rgba(0, 0, 0, 0.62)" }}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full surface-card flex flex-col"
        style={{
          maxWidth: 520,
          maxHeight: "min(90vh, 720px)",
          borderRadius: "var(--radius-md)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-end shrink-0"
          style={{ padding: "12px 14px 0" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex items-center justify-center"
            style={{
              width: 34,
              height: 34,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-muted)",
              background: "var(--bg-elevated)",
              color: "var(--text-2)",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Title block */}
        <div
          className="flex flex-col items-center text-center shrink-0"
          style={{ padding: "0 24px 16px" }}
        >
          <span
            className="flex items-center justify-center shrink-0"
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--radius-full)",
              background: "var(--bg-elevated)",
              boxShadow: "0 0 0 1px var(--border-card)",
              marginBottom: 12,
            }}
            aria-hidden
          >
            <IconBancoFilled size={26} />
          </span>

          <div
            className="inline-flex items-center justify-center flex-wrap"
            style={{ gap: 10 }}
          >
            <h2
              id={titleId}
              className="font-bold"
              style={{
                fontSize: 18,
                color: "var(--text-1)",
                margin: 0,
                lineHeight: 1.25,
              }}
            >
              {a.name}
            </h2>
            <span
              className="inline-flex items-center justify-center font-semibold shrink-0"
              style={{
                height: 24,
                padding: "0 9px",
                borderRadius: 8,
                ...statusBadgeColors(a.status),
                fontSize: 11,
                lineHeight: 1,
                whiteSpace: "nowrap",
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}
            >
              {statusLabel(a.status)}
            </span>
          </div>
          <p
            className="tabular"
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              margin: "6px 0 0",
            }}
          >
            {a.code} · ID {a.id}
          </p>
        </div>

        {/* Fields */}
        <div
          className="flex-1 overflow-y-auto min-h-0"
          style={{ padding: "4px 24px 8px" }}
        >
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
          >
            <ReadField
              label="Ordem na rota"
              value={
                a.priority === 1
                  ? `#${a.priority} · Principal`
                  : `#${a.priority} · Fallback`
              }
            />
            <ReadField label="Liquidação" value={a.settlement} />
            <ReadField
              label="Taxa percentual"
              value={`${a.feePercent.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}%`}
              valueStyle={moneyValueStyle}
            />
            <ReadField
              label="Taxa fixa"
              value={formatBRL(a.feeFixed)}
              valueStyle={moneyValueStyle}
            />
            <ReadField
              label="Volume no mês"
              value={formatBRL(a.volumeMes)}
              valueStyle={{
                ...moneyValueStyle,
                color:
                  a.status === "inativo" ? "var(--text-3)" : "var(--text-1)",
              }}
            />
            <ReadField
              label="Transações no mês"
              value={a.transactionsMes.toLocaleString("pt-BR")}
              valueStyle={moneyValueStyle}
            />
            <ReadField
              label="Taxas pagas"
              value={formatBRL(
                a.volumeMes * (a.feePercent / 100) +
                  a.transactionsMes * a.feeFixed
              )}
              valueStyle={{
                ...moneyValueStyle,
                color: "#ef4444",
              }}
              full
            />
          </div>

          {/* Rota: principal tenta primeiro; se falhar, fallbacks */}
          <div
            className="flex items-center justify-between gap-3"
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-card)",
            }}
          >
            <div className="min-w-0">
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-1)",
                }}
              >
                Ordem de roteamento
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 12,
                  color: "var(--text-3)",
                  lineHeight: 1.4,
                }}
              >
                #1 é a adquirente principal da API (PIX e saques). Subir com as
                setas promove na fila e passa a gerar cobranças nela.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={a.priority <= 1}
                onClick={() => onMovePriority?.(a.id, -1)}
                className="inline-flex items-center justify-center font-semibold"
                style={{
                  ...btnBase,
                  width: 40,
                  padding: 0,
                  border: "none",
                  background: "#ffffff",
                  color: "#0a0f0c",
                  opacity: a.priority <= 1 ? 0.4 : 1,
                  cursor: a.priority <= 1 ? "not-allowed" : "pointer",
                }}
                aria-label="Subir na rota"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={a.priority >= maxPriority}
                onClick={() => onMovePriority?.(a.id, 1)}
                className="inline-flex items-center justify-center font-semibold"
                style={{
                  ...btnBase,
                  width: 40,
                  padding: 0,
                  border: "none",
                  background: "#ef4444",
                  color: "#ffffff",
                  opacity: a.priority >= maxPriority ? 0.4 : 1,
                  cursor:
                    a.priority >= maxPriority ? "not-allowed" : "pointer",
                }}
                aria-label="Descer na rota"
              >
                ↓
              </button>
            </div>
          </div>
        </div>

        {/* Footer — ações de status só no modal (padrão saques) */}
        <div
          className="flex flex-wrap items-center justify-end gap-2.5 shrink-0"
          style={{ padding: "12px 24px 20px" }}
        >
          {a.status !== "ativo" ? (
            <button
              type="button"
              onClick={() => onStatusChange?.(a.id, "ativo")}
              className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
              style={{
                ...btnBase,
                border: "none",
                background: "#ffffff",
                color: "#0a0f0c",
              }}
            >
              Ativar
            </button>
          ) : null}

          {a.status !== "manutencao" ? (
            <button
              type="button"
              onClick={() => onStatusChange?.(a.id, "manutencao")}
              className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
              style={{
                ...btnBase,
                border: "none",
                background: "#eab308",
                color: "#0a0f0c",
              }}
            >
              Manutenção
            </button>
          ) : null}

          {a.status !== "inativo" ? (
            <button
              type="button"
              onClick={() => onStatusChange?.(a.id, "inativo")}
              className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
              style={{
                ...btnBase,
                border: "none",
                background: "#ef4444",
                color: "#ffffff",
              }}
            >
              Desativar
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
            style={{
              ...btnBase,
              border: "1px solid var(--border-muted)",
              background: "var(--bg-elevated)",
              color: "var(--text-1)",
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
