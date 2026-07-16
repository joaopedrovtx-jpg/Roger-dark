"use client";

import { useEffect, useId, type CSSProperties } from "react";
import { X } from "lucide-react";
import { formatBRL, formatChartDate } from "@/lib/format";
import {
  GERENTE_PERMISSION_OPTIONS,
  type AdminGerente,
  type GerenteStatus,
} from "@/lib/mock/admin";

interface AdminGerenteDetailModalProps {
  gerente: AdminGerente | null;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (id: string, status: GerenteStatus) => void;
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function statusLabel(s: GerenteStatus): string {
  return s === "ativo" ? "Ativo" : "Inativo";
}

function statusBadgeColors(s: GerenteStatus): {
  background: string;
  color: string;
} {
  if (s === "ativo") return { background: "#ffffff", color: "#0a0f0c" };
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

export function AdminGerenteDetailModal({
  gerente,
  open,
  onClose,
  onStatusChange,
}: AdminGerenteDetailModalProps) {
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

  if (!open || !gerente) return null;

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
          maxWidth: 560,
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
          className="relative flex flex-col items-center text-center shrink-0"
          style={{ padding: "0 24px 14px" }}
        >
          <span
            className="flex items-center justify-center overflow-hidden font-bold shrink-0"
            style={{
              width: 88,
              height: 88,
              borderRadius: "var(--radius-full)",
              background: "var(--bg-elevated)",
              color: "var(--green-use)",
              fontSize: 26,
              letterSpacing: "0.02em",
              boxShadow: "0 0 0 1px var(--border-card)",
              marginBottom: 12,
            }}
            aria-hidden
          >
            {initials(gerente.name)}
          </span>

          <div
            className="inline-flex items-center justify-center flex-wrap"
            style={{ gap: 10 }}
          >
            <h2
              id={titleId}
              className="font-bold"
              style={{
                fontSize: 20,
                color: "var(--text-1)",
                margin: 0,
                lineHeight: 1.25,
              }}
            >
              {gerente.name}
            </h2>
            <span
              className="inline-flex items-center justify-center font-semibold shrink-0"
              style={{
                height: 24,
                padding: "0 9px",
                borderRadius: 8,
                ...statusBadgeColors(gerente.status),
                fontSize: 11,
                lineHeight: 1,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}
            >
              {statusLabel(gerente.status)}
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
            ID {gerente.id}
          </p>
        </div>

        <div
          className="flex-1 overflow-y-auto min-h-0"
          style={{ padding: "4px 24px 22px" }}
        >
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            <ReadField label="Nome" value={gerente.name} />
            <ReadField label="E-mail" value={gerente.email} />
            <ReadField label="Telefone" value={gerente.phone} />
            <ReadField
              label="Data de cadastro"
              value={formatDateTime(gerente.createdAt)}
            />
            <ReadField
              label="Sellers sob gestão"
              value={String(gerente.sellersCount)}
            />
            <ReadField
              label="Volume total"
              value={formatBRL(gerente.volumeTotal)}
              valueStyle={moneyValueStyle}
            />
            {gerente.document ? (
              <ReadField label="CPF" value={gerente.document} />
            ) : null}
            {gerente.userId ? (
              <ReadField label="Seller de origem" value={gerente.userId} />
            ) : null}
          </div>

          {gerente.permissions?.length ? (
            <div style={{ marginTop: 16 }}>
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text-2)",
                }}
              >
                Habilidades de acesso
              </p>
              <div className="flex flex-wrap" style={{ gap: 6 }}>
                {GERENTE_PERMISSION_OPTIONS.filter((o) =>
                  gerente.permissions.includes(o.id)
                ).map((o) => (
                  <span
                    key={o.id}
                    className="inline-flex items-center font-semibold"
                    style={{
                      height: 26,
                      padding: "0 10px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid var(--border-muted)",
                      color: "var(--text-1)",
                      fontSize: 11.5,
                    }}
                  >
                    {o.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div
          className="flex flex-wrap items-center justify-end gap-2.5 shrink-0"
          style={{ padding: "8px 24px 20px", position: "relative", zIndex: 2 }}
        >
          {gerente.status !== "ativo" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange?.(gerente.id, "ativo");
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
              Ativar
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange?.(gerente.id, "inativo");
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
              Desativar
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
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
