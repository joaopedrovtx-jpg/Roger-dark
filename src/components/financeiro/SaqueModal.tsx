"use client";

import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { api } from "@/lib/api/client";

const SAQUE_MINIMO = 5;

interface SaqueModalProps {
  open: boolean;
  onClose: () => void;
  available: number;
  /** Taxa % configurada no admin para o seller (ex.: 3) */
  feePercent?: number;
  feeFixed?: number;
  /** chamado após saque criado com sucesso (recarregar lista) */
  onSuccess?: () => void;
}

/** Cantos arredondadinhos — padrão da plataforma (não pill) */
const radiusSoft = "var(--radius-md)" as const;

/** Label + input no mesmo shell (layout anterior) */
const fieldShell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 14px",
  borderRadius: radiusSoft,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-card)",
};

const fieldLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-3)",
};

const fieldInput: CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-1)",
  fontSize: 14,
  fontWeight: 500,
  padding: 0,
  fontFamily: "inherit",
};

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function SaqueModal({
  open,
  onClose,
  available,
  feePercent = 3,
  feeFixed = 0,
  onSuccess,
}: SaqueModalProps) {
  const titleId = useId();
  const [pixKey, setPixKey] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const amountValue = useMemo(() => parseAmount(amount), [amount]);
  const fee =
    amountValue > 0
      ? Math.round((amountValue * (feePercent / 100) + feeFixed) * 100) / 100
      : 0;
  const net = amountValue > 0 ? Math.max(0, amountValue - fee) : 0;

  useEffect(() => {
    if (!open) {
      setPixKey("");
      setAmount("");
      return;
    }

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

  if (!open) return null;

  const overBalance = amountValue > available;
  const belowMin = amountValue > 0 && amountValue < SAQUE_MINIMO;
  const canSubmit =
    pixKey.trim().length > 0 &&
    amountValue >= SAQUE_MINIMO &&
    !overBalance;

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
          maxWidth: 420,
          borderRadius: radiusSoft,
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: "18px 18px 4px" }}
        >
          <h2
            id={titleId}
            className="font-bold"
            style={{ margin: 0, fontSize: 17, color: "var(--text-1)" }}
          >
            Solicitar saque
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              border: "none",
              background: "transparent",
              color: "var(--text-2)",
              cursor: "pointer",
              borderRadius: radiusSoft,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="flex flex-col"
          style={{ padding: "8px 18px 18px", gap: 14 }}
        >
          {/* Saldo — só o valor */}
          <div className="text-center" style={{ padding: "14px 0 6px" }}>
            <div
              className="tabular font-bold"
              style={{
                fontSize: 32,
                color: "var(--text-1)",
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
            >
              {formatBRL(available)}
            </div>
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 13,
                color: "var(--text-3)",
              }}
            >
              Saldo disponível para saque.
            </p>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12.5,
                color: "var(--text-3)",
              }}
            >
              Saque mínimo: {formatBRL(SAQUE_MINIMO)}
            </p>
          </div>

          {/* Valor do saque — cantos arredondadinhos */}
          <label style={fieldShell}>
            <span style={fieldLabel}>
              Valor do saque <span style={{ color: "#ef4444" }}>*</span>
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular"
              style={fieldInput}
            />
          </label>

          {/* Box taxa / você recebe — mesma cor sólida do campo Chave PIX */}
          <div
            style={{
              padding: "12px 14px",
              borderRadius: radiusSoft,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-card)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-2)",
                lineHeight: 1.35,
              }}
            >
              <span style={{ color: "var(--text-2)" }}>Você vai receber </span>
              <span
                className="tabular"
                style={{
                  color: "#22c55e",
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                {formatBRL(net)}
              </span>
            </p>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 12.5,
                color: "var(--text-3)",
                lineHeight: 1.4,
              }}
            >
              Taxa de saque: {feePercent}%
              {feeFixed > 0 ? ` + ${formatBRL(feeFixed)}` : ""} (configurada na
              sua conta).
            </p>
          </div>

          {/* Chave PIX — cantos arredondadinhos */}
          <label style={fieldShell}>
            <span style={fieldLabel}>
              Chave PIX <span style={{ color: "#ef4444" }}>*</span>
            </span>
            <input
              type="text"
              autoFocus
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              style={fieldInput}
            />
          </label>

          <p
            style={{
              margin: 0,
              fontSize: 12.5,
              color: "var(--text-3)",
              lineHeight: 1.45,
            }}
          >
            Os valores disponíveis podem ser sacados via PIX de forma imediata.
          </p>

          {overBalance ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "#f87171" }}>
              Valor acima do saldo disponível.
            </p>
          ) : null}
          {belowMin ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "#f87171" }}>
              O saque mínimo é {formatBRL(SAQUE_MINIMO)}.
            </p>
          ) : null}

          {/* Fechar + Solicitar — mesmo padrão dos outros botões da plataforma */}
          <div
            className="flex items-center justify-end gap-2.5"
            style={{ marginTop: 4 }}
          >
            <button
              type="button"
              onClick={onClose}
              className="transition-opacity hover:opacity-90"
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: radiusSoft,
                border: "1px solid var(--border-muted)",
                background: "var(--bg-elevated)",
                color: "var(--text-1)",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={!canSubmit || submitting}
              className="transition-opacity"
              style={{
                height: 42,
                padding: "0 18px",
                borderRadius: radiusSoft,
                border: "none",
                background: "#ffffff",
                color: "#0a0f0c",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
                opacity: canSubmit && !submitting ? 1 : 0.45,
              }}
              onClick={async () => {
                setSubmitError(null);
                setSubmitting(true);
                try {
                  await api.client.createWithdrawal({
                    amount: amountValue,
                    pixKey: pixKey.trim(),
                  });
                  onSuccess?.();
                  onClose();
                } catch (e) {
                  setSubmitError(
                    e instanceof Error ? e.message : "Falha ao solicitar saque"
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Enviando…" : "Solicitar"}
            </button>
          </div>
          {submitError ? (
            <p
              role="alert"
              style={{
                margin: "8px 0 0",
                fontSize: 12.5,
                color: "#f87171",
                textAlign: "right",
              }}
            >
              {submitError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
