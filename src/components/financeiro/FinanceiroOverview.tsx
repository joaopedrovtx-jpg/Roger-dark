"use client";

import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Loader2, X } from "lucide-react";
import { formatBRL, formatChartDate } from "@/lib/format";
import type { SaqueStatus, SaqueTransaction } from "@/lib/mock/financeiro";
import {
  IconDolarSymbol,
  IconLockFilled,
  IconOutflowFilled,
  IconPixFilled,
} from "@/components/dashboard/KpiIcons";
import { SaqueModal } from "./SaqueModal";
import { isImpersonating } from "@/lib/client/impersonate";

const PENDING_YELLOW = "#f5a623";
const RECUSADO_RED = "#ef4444";

function statusLabel(status: SaqueStatus): string {
  const map: Record<SaqueStatus, string> = {
    pago: "Pago",
    recusado: "Recusado",
    processando: "Pendente",
  };
  return map[status];
}

function isPending(status: SaqueStatus): boolean {
  return status === "processando";
}

/**
 * Fundo do ícone Pix + valor mesmo padrão das transações
 * pendente → amarelo · recusado → vermelho · pago → branco + ícone preto
 */
function toneForStatus(status: SaqueStatus): {
  color: string;
  iconBg: string;
  iconTone: "white" | "black";
} {
  switch (status) {
    case "processando":
      return {
        color: PENDING_YELLOW,
        iconBg: PENDING_YELLOW,
        iconTone: "white",
      };
    case "recusado":
      return {
        color: RECUSADO_RED,
        iconBg: RECUSADO_RED,
        iconTone: "white",
      };
    case "pago":
    default:
      return {
        color: "var(--green-use)",
        iconBg: "#ffffff",
        iconTone: "black",
      };
  }
}

function formatDateTime(iso: string): string {
  const date = formatChartDate(iso);
  const time = iso.includes("T") ? (iso.split("T")[1] || "").slice(0, 5) : "";
  return time ? `${date} ${time}` : date;
}

const ICON = 24;

const thStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-3)",
  borderBottom: "1px solid var(--border-card)",
};

const tdBase: CSSProperties = {
  borderBottom: "1px solid var(--border-card)",
  fontSize: 13,
};

const btnPrimary: CSSProperties = {
  height: 32,
  padding: "0 14px",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "#ffffff",
  color: "#0a0f0c",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

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

function SaqueDetailModal({
  saque,
  open,
  onClose,
}: {
  saque: SaqueTransaction | null;
  open: boolean;
  onClose: () => void;
}) {
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

  const tone = toneForStatus(saque.status);

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
          maxWidth: 460,
          borderRadius: "var(--radius-md)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: "16px 18px 0" }}
        >
          <h2
            id={titleId}
            className="font-bold"
            style={{ margin: 0, fontSize: 17, color: "var(--text-1)" }}
          >
            Detalhes do saque
          </h2>
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

        <div
          className="flex flex-col items-center text-center"
          style={{ padding: "14px 18px 8px" }}
        >
          <span
            className="flex items-center justify-center"
            style={{
              width: 48,
              height: 48,
              borderRadius: "var(--radius-sm)",
              background: tone.iconBg,
              marginBottom: 10,
            }}
          >
            <IconPixFilled size={22} tone={tone.iconTone} />
          </span>
          <p
            className="tabular font-bold"
            style={{ margin: 0, fontSize: 22, color: tone.color }}
          >
            {formatBRL(saque.amount)}
          </p>
          <p
            className="font-semibold"
            style={{ margin: "6px 0 0", fontSize: 13, color: tone.color }}
          >
            {statusLabel(saque.status)}
          </p>
          <p
            className="tabular"
            style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-3)" }}
          >
            {saque.id}
          </p>
        </div>

        <div
          className="grid gap-2.5"
          style={{
            padding: "8px 18px 8px",
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          {(
            [
              ["Data", formatDateTime(saque.date)],
              ["Método", saque.method],
              ["Chave PIX", saque.destination],
              ["Valor", formatBRL(saque.amount)],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              style={{
                ...fieldShell,
                ...(label === "Chave PIX" ? { gridColumn: "1 / -1" } : null),
              }}
            >
              <span
                style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}
              >
                {label}
              </span>
              <span
                className={label === "Valor" ? "tabular" : undefined}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color:
                    label === "Valor" ? tone.color : "var(--text-1)",
                  wordBreak: "break-all",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        <div
          className="flex justify-end shrink-0"
          style={{ padding: "8px 18px 18px" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
            style={{
              height: 42,
              padding: "0 18px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-muted)",
              background: "var(--bg-elevated)",
              color: "var(--text-1)",
              fontSize: 13.5,
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

export function FinanceiroOverview() {
  const [rows, setRows] = useState<SaqueTransaction[]>([]);
  const [available, setAvailable] = useState(0);
  const [held, setHeld] = useState(0);
  const [pending, setPending] = useState(0);
  const [totalOut, setTotalOut] = useState(0);
  const [saquePercent, setSaquePercent] = useState(3);
  const [saqueFixed, setSaqueFixed] = useState(0);
  const [saqueOpen, setSaqueOpen] = useState(false);
  const [selected, setSelected] = useState<SaqueTransaction | null>(null);
  const [viewOnly, setViewOnly] = useState(false);

  useEffect(() => {
    setViewOnly(isImpersonating());
    function sync() {
      setViewOnly(isImpersonating());
    }
    window.addEventListener("darkpay:impersonate", sync);
    return () => window.removeEventListener("darkpay:impersonate", sync);
  }, []);

  async function reload() {
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch("/api/v1/finance");
      if (!res.ok) throw new Error("Falha ao carregar financeiro");
      const fin = (await res.json()) as {
        balances: { available: number; held: number; pending?: number };
        totalOut: number;
        fees?: { saquePercent?: number; saqueFixed?: number };
        withdrawals: Array<{
          id: string;
          date: string;
          amount: number;
          method: string;
          destination: string;
          status: SaqueStatus;
        }>;
      };
      setAvailable(fin.balances.available);
      setHeld(fin.balances.held);
      setPending(fin.balances.pending ?? 0);
      setTotalOut(fin.totalOut);
      if (fin.fees?.saquePercent != null) setSaquePercent(fin.fees.saquePercent);
      if (fin.fees?.saqueFixed != null) setSaqueFixed(fin.fees.saqueFixed);
      setRows(
        fin.withdrawals.map((w) => ({
          id: w.id,
          date: w.date,
          amount: w.amount,
          method: w.method as "PIX",
          destination: w.destination,
          status: w.status,
        }))
      );
    } catch {
      setRows([]);
      setAvailable(0);
      setHeld(0);
      setPending(0);
      setTotalOut(0);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const metricCards: Array<{
    key: string;
    label: string;
    value: number;
    icon: ReactNode;
    isCount?: boolean;
    isSacar?: boolean;
  }> = [
    {
      key: "out",
      label: "Total de saídas",
      value: totalOut,
      icon: <IconOutflowFilled size={ICON} />,
    },
    {
      key: "balance",
      label: "Saldo disponível",
      value: available,
      icon: <IconDolarSymbol size={ICON} />,
      isSacar: true,
    },
    {
      key: "pending",
      label: "Aguardando pagamento (PIX)",
      value: pending,
      icon: <IconLockFilled size={ICON} />,
    },
  ];

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <SaqueModal
        open={saqueOpen}
        onClose={() => setSaqueOpen(false)}
        available={available}
        feePercent={saquePercent}
        feeFixed={saqueFixed}
        onSuccess={() => void reload()}
      />
      <SaqueDetailModal
        open={!!selected}
        saque={selected}
        onClose={() => setSelected(null)}
      />

      {/* Métricas */}
      <div className="grid-kpi-3">
        {metricCards.map((card) => (
          <div
            key={card.key}
            className="surface-card flex items-center gap-3.5"
            style={{
              padding: "16px 18px",
              minHeight: 88,
              borderRadius: "var(--radius-card)",
            }}
          >
            <span
              className="flex shrink-0 items-center justify-center"
              style={{
                width: "var(--kpi-icon-size)",
                height: "var(--kpi-icon-size)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-card-inner-icon)",
              }}
            >
              {card.icon}
            </span>
            <div className="min-w-0 flex flex-1 flex-col gap-0.5">
              <span
                className="truncate"
                style={{ fontSize: 12, color: "var(--text-2)" }}
              >
                {card.label}
              </span>
              <span
                className="tabular truncate font-bold"
                style={{ fontSize: 18, color: "var(--text-1)" }}
              >
                {card.isCount ? card.value : formatBRL(card.value)}
              </span>
            </div>
            {card.isSacar ? (
              <button
                type="button"
                onClick={() => {
                  if (!viewOnly) setSaqueOpen(true);
                }}
                disabled={viewOnly}
                className="inline-flex shrink-0 items-center font-semibold text-[13px] transition-opacity hover:opacity-90"
                style={{
                  height: 34,
                  padding: "0 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--green-use)",
                  color: "var(--on-green)",
                  border: "none",
                  cursor: viewOnly ? "not-allowed" : "pointer",
                  opacity: viewOnly ? 0.4 : 1,
                }}
                title={
                  viewOnly
                    ? "Modo visualização: saque não permitido"
                    : undefined
                }
              >
                Sacar
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Histórico de saques */}
      <div
        className="surface-card overflow-hidden table-scroll"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        <div
          className="px-5 py-4 text-center"
          style={{ borderBottom: "1px solid var(--border-card)" }}
        >
          <h2
            className="font-semibold"
            style={{ fontSize: 15, color: "var(--text-1)" }}
          >
            Histórico de saques
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Data", "Chave PIX", "Valor", "Status", ""].map((h) => (
                  <th
                    key={h || "acoes"}
                    className="px-4 py-3 font-medium text-center"
                    style={thStyle}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const pending = isPending(row.status);
                const tone = toneForStatus(row.status);
                return (
                  <tr key={row.id}>
                    <td
                      className="px-4 py-3.5 text-center tabular"
                      style={{
                        ...tdBase,
                        color: "var(--text-2)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDateTime(row.date)}
                    </td>
                    <td className="px-4 py-3.5 text-center" style={tdBase}>
                      {/* Bloco de largura fixa: ícones Pix alinhados entre as linhas */}
                      <div className="flex items-center justify-center">
                        <div
                          className="flex items-center gap-2.5"
                          style={{ width: 220, maxWidth: "100%" }}
                        >
                          <span
                            className="flex shrink-0 items-center justify-center"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "var(--radius-sm)",
                              background: tone.iconBg,
                            }}
                          >
                            <IconPixFilled size={16} tone={tone.iconTone} />
                          </span>
                          <span
                            className="truncate min-w-0 text-left"
                            style={{
                              fontSize: 13,
                              color: "var(--text-2)",
                            }}
                          >
                            {row.destination}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td
                      className="px-4 py-3.5 text-center font-semibold tabular"
                      style={{
                        ...tdBase,
                        color: tone.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatBRL(row.amount)}
                    </td>
                    <td className="px-4 py-3.5 text-center" style={tdBase}>
                      <div className="flex items-center justify-center w-full">
                        <span
                          className="inline-flex items-center justify-center gap-1.5"
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: tone.color,
                            minWidth: 110,
                          }}
                        >
                          {pending ? (
                            <Loader2
                              size={14}
                              strokeWidth={2.5}
                              className="animate-spin shrink-0"
                              style={{ color: PENDING_YELLOW }}
                              aria-hidden
                            />
                          ) : (
                            <span
                              className="shrink-0"
                              style={{ width: 14 }}
                              aria-hidden
                            />
                          )}
                          {statusLabel(row.status)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center" style={tdBase}>
                      <div className="flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => setSelected(row)}
                          className="inline-flex items-center justify-center transition-opacity hover:opacity-90"
                          style={btnPrimary}
                        >
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
