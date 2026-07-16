"use client";

import { useEffect, useId, type CSSProperties } from "react";
import { X } from "lucide-react";
import { IconPixFilled } from "@/components/dashboard/KpiIcons";
import { formatBRL, formatChartDate } from "@/lib/format";
import {
  saqueFeeAmount,
  type AdminSaque,
  type AdminSaqueStatus,
} from "@/lib/mock/admin";

interface AdminSaqueDetailModalProps {
  saque: AdminSaque | null;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (id: string, status: AdminSaqueStatus) => void;
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

function formatDateTime(iso: string): string {
  const date = formatChartDate(iso);
  const time = iso.includes("T") ? iso.split("T")[1].slice(0, 5) : "";
  return time ? `${date} ${time}` : date;
}

function statusLabel(s: AdminSaqueStatus): string {
  return s === "pago" ? "Aprovado" : s === "recusado" ? "Recusado" : "Pendente";
}

function statusBadgeColors(s: AdminSaqueStatus): {
  background: string;
  color: string;
} {
  if (s === "pago") return { background: "#ffffff", color: "#0a0f0c" };
  if (s === "recusado") return { background: "#ef4444", color: "#ffffff" };
  return { background: "#eab308", color: "#0a0f0c" };
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

export function AdminSaqueDetailModal({
  saque,
  open,
  onClose,
  onStatusChange,
}: AdminSaqueDetailModalProps) {
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

  if (!open || !saque) return null;

  const fee = saqueFeeAmount(saque);
  const liquido = Math.max(0, saque.amount - fee);

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
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          maxWidth: 520,
          maxHeight: "min(90vh, 720px)",
          borderRadius: "var(--radius-card)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        <div
          className="flex items-center justify-end shrink-0"
          style={{ padding: "16px 20px 0" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="flex items-center justify-center transition-colors"
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-md)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-muted)",
              color: "var(--text-2)",
              cursor: "pointer",
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div
          className="flex flex-col items-center text-center shrink-0"
          style={{ padding: "0 24px 16px" }}
        >
          {(() => {
            const st = saque.status;
            const iconBg =
              st === "processando"
                ? "#f5a623"
                : st === "recusado"
                  ? "#ef4444"
                  : "#ffffff";
            const iconTone =
              st === "pago" ? ("black" as const) : ("white" as const);
            return (
          <span
            className="flex items-center justify-center shrink-0"
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--radius-full)",
              background: iconBg,
              boxShadow:
                st === "pago"
                  ? "0 0 0 1px var(--border-card)"
                  : "none",
              marginBottom: 12,
            }}
            aria-hidden
          >
            <IconPixFilled size={26} tone={iconTone} />
          </span>
            );
          })()}

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
              Detalhes do saque
            </h2>
            <span
              className="inline-flex items-center justify-center font-semibold shrink-0"
              style={{
                height: 24,
                padding: "0 9px",
                borderRadius: 8,
                ...statusBadgeColors(saque.status),
                fontSize: 11,
                lineHeight: 1,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}
            >
              {statusLabel(saque.status)}
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
            ID {saque.id}
          </p>
        </div>

        <div
          className="flex-1 overflow-y-auto min-h-0"
          style={{ padding: "4px 24px 8px" }}
        >
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            <ReadField label="Usuário" value={saque.userName} />
            <ReadField label="ID do usuário" value={saque.userId} />
            <ReadField
              label="Data e hora"
              value={formatDateTime(saque.date)}
            />
            <ReadField label="Método" value={saque.method} />
            <ReadField
              label="Chave PIX"
              value={saque.destination}
              full
            />
            {(() => {
              const pending = saque.status === "processando";
              const paid = saque.status === "pago";
              const refused = saque.status === "recusado";
              const amountColor = pending
                ? "#f5a623"
                : refused
                  ? "#ef4444"
                  : "var(--green-use)";
              const feeLabel = pending
                ? "Taxa de saque"
                : paid
                  ? "Taxa cobrada"
                  : "Taxa de saque";
              const feeColor = pending
                ? "#f5a623"
                : paid
                  ? "#22c55e"
                  : "var(--text-3)";
              return (
                <>
                  <ReadField
                    label="Valor solicitado"
                    value={formatBRL(saque.amount)}
                    valueStyle={{
                      ...moneyValueStyle,
                      color: amountColor,
                    }}
                  />
                  <label style={fieldShell}>
                    <span style={labelStyle}>{feeLabel}</span>
                    <input
                      type="text"
                      readOnly
                      value={formatBRL(fee)}
                      className="tabular"
                      style={{
                        ...inputStyle,
                        ...moneyValueStyle,
                        color: feeColor,
                      }}
                      tabIndex={0}
                    />
                  </label>
                  <ReadField
                    label="Valor líquido"
                    value={formatBRL(liquido)}
                    valueStyle={{
                      ...moneyValueStyle,
                      color: amountColor,
                    }}
                    full
                  />
                </>
              );
            })()}
          </div>
        </div>

        <div
          className="flex flex-wrap items-center justify-end gap-2.5 shrink-0"
          style={{ padding: "12px 24px 20px" }}
        >
          {saque.status === "processando" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onStatusChange?.(saque.id, "pago");
                  onClose();
                }}
                className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
                style={{
                  height: 38,
                  padding: "0 18px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "#ffffff",
                  color: "#0a0f0c",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => {
                  onStatusChange?.(saque.id, "recusado");
                  onClose();
                }}
                className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
                style={{
                  height: 38,
                  padding: "0 18px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: "#ef4444",
                  color: "#ffffff",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Recusar
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
            style={{
              height: 38,
              padding: "0 18px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-muted)",
              background: "var(--bg-elevated)",
              color: "var(--text-1)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
