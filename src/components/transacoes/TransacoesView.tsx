"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { Loader2, X } from "lucide-react";
import { formatBRL, formatDateTime } from "@/lib/format";
import type {
  TransacoesMetrics,
  VendaStatus,
  VendaTransaction,
} from "@/lib/mock/transacoes";
import {
  IconClockFilled,
  IconCheckFilled,
  IconXFilled,
  IconOutflowFilled,
  IconPixFilled,
  IconPercentFilled,
  IconTransferFilled,
} from "@/components/dashboard/KpiIcons";

/** Métricas vazias só preenche com vendas reais da API */
const EMPTY_METRICS: TransacoesMetrics = {
  pendentes: 0,
  pagos: 0,
  recusados: 0,
  reembolsos: 0,
  ticketMedio: 0,
  taxaConversao: 0,
};

function statusLabel(status: VendaStatus): string {
  const map: Record<VendaStatus, string> = {
    pendente: "Pendente",
    aprovada: "Pago",
    recusada: "Recusado",
    reembolsada: "Reembolsado",
  };
  return map[status];
}

/** Cores sólidas (igual painel admin) sem transparente */
const SOLID = {
  pending: "#f5a623",
  refused: "#ef4444",
  approved: "var(--green-use)",
  approvedBg: "#ffffff",
} as const;

/**
 * Fundo do ícone + valor + status:
 * pendente → amarelo · recusada/reembolso → vermelho · pago → branco
 */
function toneForStatus(status: VendaStatus): {
  color: string;
  iconBg: string;
  iconTone: "white" | "black";
} {
  switch (status) {
    case "pendente":
      return {
        color: SOLID.pending,
        iconBg: SOLID.pending,
        iconTone: "white",
      };
    case "recusada":
    case "reembolsada":
      return {
        color: SOLID.refused,
        iconBg: SOLID.refused,
        iconTone: "white",
      };
    case "aprovada":
    default:
      return {
        color: SOLID.approved,
        iconBg: SOLID.approvedBg,
        iconTone: "black",
      };
  }
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

function buildMetricCards(m: TransacoesMetrics): Array<{
  key: string;
  label: string;
  value: string;
  icon: ReactNode;
}> {
  return [
  {
    key: "pagos",
    label: "Pago",
    value: formatBRL(m.pagos),
    icon: <IconCheckFilled size={ICON} />,
  },
  {
    key: "pendentes",
    label: "Pendentes",
    value: formatBRL(m.pendentes),
    icon: <IconClockFilled size={ICON} />,
  },
  {
    key: "ticketMedio",
    label: "Ticket médio",
    value: formatBRL(m.ticketMedio),
    icon: <IconTransferFilled size={28} />,
  },
  {
    key: "recusados",
    label: "Recusados",
    value: formatBRL(m.recusados),
    icon: <IconXFilled size={ICON} />,
  },
  {
    key: "reembolsos",
    label: "Reembolso",
    value: formatBRL(m.reembolsos),
    icon: <IconOutflowFilled size={ICON} />,
  },
  {
    key: "taxaConversao",
    label: "Taxa de conversão",
    value: `${m.taxaConversao.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`,
    icon: <IconPercentFilled size={ICON} />,
  },
  ];
}

function TxDetailModal({
  tx,
  open,
  onClose,
}: {
  tx: VendaTransaction | null;
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

  if (!open || !tx) return null;

  const tone = toneForStatus(tx.status);

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
            Detalhes da transação
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
            {formatBRL(tx.amount)}
          </p>
          <p
            className="font-semibold"
            style={{ margin: "6px 0 0", fontSize: 13, color: tone.color }}
          >
            {statusLabel(tx.status)}
          </p>
          <p
            className="tabular"
            style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-3)" }}
          >
            {tx.id}
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
              ["Data", formatDateTime(tx.date)],
              ["Método", tx.method],
              ["Cliente", tx.customer],
              ["Produto", tx.product],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              style={{
                ...fieldShell,
                ...(label === "Produto" || label === "Cliente"
                  ? { gridColumn: "1 / -1" }
                  : null),
              }}
            >
              <span
                style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-1)",
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

function mapTxItems(
  items: Array<{
    id: string;
    date: string;
    customer?: string;
    product?: string;
    amount: number;
    status: string;
  }>
): VendaTransaction[] {
  return items.map((t) => ({
    id: t.id,
    date: t.date,
    customer: t.customer ?? "-",
    product: t.product ?? "-",
    method: "PIX" as const,
    amount: t.amount,
    status: t.status as VendaStatus,
  }));
}

export function TransacoesView() {
  const [rows, setRows] = useState<VendaTransaction[]>([]);
  const [metrics, setMetrics] = useState<TransacoesMetrics>(EMPTY_METRICS);
  const [selected, setSelected] = useState<VendaTransaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadList(): Promise<VendaTransaction[]> {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch("/api/v1/transactions?pageSize=100");
      if (!res.ok) {
        if (!cancelled) {
          setRows([]);
          setMetrics(EMPTY_METRICS);
        }
        return [];
      }
      const json = (await res.json()) as {
        items?: Array<{
          id: string;
          date: string;
          customer?: string;
          product?: string;
          amount: number;
          status: string;
        }>;
        metrics?: TransacoesMetrics;
      };
      if (cancelled) return [];
      const items = mapTxItems(json.items ?? []);
      setRows(items);
      setMetrics(json.metrics ?? EMPTY_METRICS);
      return items;
    }

    /**
     * Sincroniza PIX pendentes com a adquirente (Velana/PodPay).
     * Corrige o caso em que o webhook não atualizou e a venda já está "paid".
     */
    async function syncPending(list: VendaTransaction[]) {
      const pending = list
        .filter((t) => t.status === "pendente")
        .slice(0, 12);
      if (pending.length === 0) return false;

      const { authedFetch } = await import("@/lib/client/session");
      let anyPaid = false;
      // Em paralelo limitado (lotes de 4)
      for (let i = 0; i < pending.length; i += 4) {
        if (cancelled) return anyPaid;
        const batch = pending.slice(i, i + 4);
        const results = await Promise.all(
          batch.map(async (t) => {
            try {
              const res = await authedFetch(
                `/api/v1/payments/${encodeURIComponent(t.id)}/sync`,
                { method: "POST" }
              );
              if (!res.ok) return false;
              const json = (await res.json()) as { status?: string };
              return (
                json.status === "paid" ||
                json.status === "aprovada"
              );
            } catch {
              return false;
            }
          })
        );
        if (results.some(Boolean)) anyPaid = true;
      }
      return anyPaid;
    }

    (async () => {
      try {
        const items = await loadList();
        // Após carregar, tenta atualizar pendentes → pagos na adquirente
        const changed = await syncPending(items);
        if (!cancelled && changed) {
          await loadList();
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setMetrics(EMPTY_METRICS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Enquanto houver pendentes na tela, re-sincroniza a cada 12s
    const poll = window.setInterval(() => {
      if (cancelled) return;
      void (async () => {
        try {
          const { authedFetch } = await import("@/lib/client/session");
          const res = await authedFetch("/api/v1/transactions?pageSize=100");
          if (!res.ok || cancelled) return;
          const json = (await res.json()) as {
            items?: Array<{
              id: string;
              date: string;
              customer?: string;
              product?: string;
              amount: number;
              status: string;
            }>;
            metrics?: TransacoesMetrics;
          };
          const items = mapTxItems(json.items ?? []);
          const pending = items.filter((t) => t.status === "pendente");
          if (pending.length === 0) {
            if (!cancelled) {
              setRows(items);
              setMetrics(json.metrics ?? EMPTY_METRICS);
            }
            return;
          }
          // sync top 6 pendentes
          await Promise.all(
            pending.slice(0, 6).map(async (t) => {
              try {
                await authedFetch(
                  `/api/v1/payments/${encodeURIComponent(t.id)}/sync`,
                  { method: "POST" }
                );
              } catch {
                /* ignore */
              }
            })
          );
          if (cancelled) return;
          const res2 = await authedFetch("/api/v1/transactions?pageSize=100");
          if (!res2.ok || cancelled) return;
          const json2 = (await res2.json()) as {
            items?: Array<{
              id: string;
              date: string;
              customer?: string;
              product?: string;
              amount: number;
              status: string;
            }>;
            metrics?: TransacoesMetrics;
          };
          if (cancelled) return;
          setRows(mapTxItems(json2.items ?? []));
          setMetrics(json2.metrics ?? EMPTY_METRICS);
        } catch {
          /* ignore poll errors */
        }
      })();
    }, 12_000);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, []);

  const metricCards = buildMetricCards(metrics);

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <TxDetailModal
        open={!!selected}
        tx={selected}
        onClose={() => setSelected(null)}
      />

      {/* Indicadores */}
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
                {card.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Histórico de vendas */}
      <div
        className="surface-card overflow-hidden"
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
            Histórico de transações
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Data",
                  "Cliente",
                  "Produto",
                  "Método",
                  "Valor",
                  "Status",
                  "",
                ].map((h) => (
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
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center"
                    style={{ ...tdBase, color: "var(--text-3)", borderBottom: "none" }}
                  >
                    {loading
                      ? "Carregando vendas…"
                      : "Nenhuma venda ainda. Gere um PIX em Integrações → Pagamentos e pague. A venda aparece aqui."}
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
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
                    <td
                      className="px-4 py-3.5 text-center"
                      style={{ ...tdBase, color: "var(--text-2)" }}
                    >
                      {row.customer}
                    </td>
                    <td
                      className="px-4 py-3.5 text-center"
                      style={{ ...tdBase, color: "var(--text-2)" }}
                    >
                      {row.product}
                    </td>
                    <td className="px-4 py-3.5 text-center" style={tdBase}>
                      <div className="flex items-center justify-center">
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
                          {row.status === "pendente" ? (
                            <Loader2
                              size={14}
                              strokeWidth={2.5}
                              className="animate-spin shrink-0"
                              style={{ color: tone.color }}
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
