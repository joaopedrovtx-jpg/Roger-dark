"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import type { PeriodValue } from "@/components/dashboard/PeriodFilter";
import {
  IconDolarSymbol,
  IconMoneyFlying,
  IconTransferFilled,
  IconPercentFilled,
  IconPixFilled,
  IconUsersFilled,
  IconCheckFilled,
  IconLockFilled,
} from "@/components/dashboard/KpiIcons";
import { AdminStatusBadge } from "./AdminStatusBadge";
import { AdminTd } from "./AdminTable";
import { formatBRL, formatChartDate } from "@/lib/format";
import {
  adminMetricsMock,
  type AdminMetrics,
  type AdminTxStatus,
  type AdminLedgerTx,
} from "@/lib/mock/admin";

const ICON = 24;
const ICON_TX = 28;

/** Opções do seletor “Por página” (como na referência) */
const PAGE_SIZE_OPTIONS = [5, 10, 20, 40] as const;
/** Tamanho máximo do buffer em memória */
const MAX_BUFFER = 80;
/** Polling do histórico real (ms) */
const LIVE_INTERVAL_MS = 5000;

const DEFAULT_PERIOD: PeriodValue = {
  key: "7d",
  label: "Últimos 7 dias",
};

function formatDateTime(iso: string): string {
  if (!iso || iso === "undefined" || iso === "null") return "-";
  try {
    const date = formatChartDate(iso);
    if (!date || date.includes("NaN") || date.includes("undefined")) return "-";
    const time = iso.includes("T") ? iso.split("T")[1]?.slice(0, 5) : "";
    if (!time || time.includes("undefined")) return date;
    return `${date} ${time}`;
  } catch {
    return "-";
  }
}

/** Nome + sobrenome em uma linha (sem undefined) */
function formatSellerName(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(/\b(undefined|null)\b/gi, "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return "Seller";
  const parts = s.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function formatMethod(raw: unknown): string {
  const s = String(raw ?? "PIX")
    .replace(/\b(undefined|null)\b/gi, "")
    .trim()
    .toUpperCase();
  if (!s) return "PIX";
  return s;
}

function statusLabel(status: AdminTxStatus | string): string {
  const map: Record<string, string> = {
    pendente: "Pendente",
    aprovada: "Aprovado",
    recusada: "Recusada",
    reembolsada: "Reembolso",
    pago: "Aprovado",
    processando: "Pendente",
    recusado: "Recusado",
  };
  return map[String(status || "pendente")] || "Pendente";
}

function statusTone(
  status: AdminTxStatus
): "success" | "warning" | "danger" | "muted" {
  // Saque aprovado (pago) → vermelho; venda aprovada → branco do tema
  if (status === "aprovada") return "success";
  if (status === "pago") return "danger";
  if (status === "pendente" || status === "processando") return "warning";
  if (status === "reembolsada") return "muted";
  return "danger";
}

function isSpinning(status: AdminTxStatus): boolean {
  return status === "pendente" || status === "processando";
}

/**
 * Cor do valor e do fundo do ícone PIX (sólido, sem borda) alinhados ao status:
 * - aprovada → branco do tema
 * - pendente / processando → amarelo
 * - pago (saque) / recusada / recusado → vermelho
 * - reembolsada → cinza
 */
function toneForTx(tx: AdminLedgerTx): {
  color: string;
  iconBg: string;
  iconTone: "white" | "black";
} {
  switch (tx.status) {
    case "processando":
    case "pendente":
      return {
        color: "#f5a623",
        iconBg: "#f5a623",
        iconTone: "white",
      };
    case "pago":
    case "recusada":
    case "recusado":
      return {
        color: "#f87171",
        iconBg: "#f87171",
        iconTone: "white",
      };
    case "reembolsada":
      return {
        color: "#8b93a3",
        iconBg: "#8b93a3",
        iconTone: "white",
      };
    case "aprovada":
    default:
      // Aprovado: fundo branco + ícone PIX preto
      return {
        color: "var(--green-use)",
        iconBg: "#ffffff",
        iconTone: "black",
      };
  }
}

function formatAmount(tx: AdminLedgerTx): { text: string; color: string } {
  return {
    text: formatBRL(tx.amount),
    color: toneForTx(tx).color,
  };
}

/**
 * Layout espelhado da Dashboard de usuário:
 * 1) 3 indicadores no topo
 * 2) gráfico (2 cols) + 4 métricas empilhadas (1 col)
 * 3) histórico real (API de pagamento / PIX) com polling sem fake
 */
export function AdminDashboardView() {
  const [period, setPeriod] = useState<PeriodValue>(DEFAULT_PERIOD);
  const [m, setMetrics] = useState<AdminMetrics>(adminMetricsMock);
  const [chartData, setChartData] = useState<
    Array<{ date: string; amount: number; grain?: "hour" | "day" }>
  >(() => {
    // 7 dias reais com 0 até a API carregar
    const rows: Array<{ date: string; amount: number; grain: "day" }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      rows.push({
        date: d.toISOString().slice(0, 10),
        amount: 0,
        grain: "day",
      });
    }
    return rows;
  });
  const [dataSource, setDataSource] = useState<"mysql" | "mock">("mock");

  /** Só TXs reais do banco */
  const [ledger, setLedger] = useState<AdminLedgerTx[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(40);
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const pageSizeRootRef = useRef<HTMLDivElement>(null);
  const pageSizeMenuId = useId();

  const loadDashboard = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch(
        `/api/v1/admin/dashboard?period=${encodeURIComponent(period.key)}`
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        source?: "mysql" | "mock" | "database";
        metrics?: AdminMetrics;
        volumeHistory?: Array<{
          date?: string;
          amount?: number;
          grain?: "hour" | "day";
        }>;
        ledger?: AdminLedgerTx[];
      };
      if (json.metrics) setMetrics(json.metrics);
      // Gráfico real (volume da API) sem métricas fictícias
      if (Array.isArray(json.volumeHistory)) {
        const cleaned = json.volumeHistory
          .map((p: { date?: string; amount?: number; grain?: "hour" | "day" }) => {
            const raw = p?.date != null ? String(p.date) : "";
            const m = raw.match(/(\d{4}-\d{2}-\d{2})/);
            return {
              date: m ? m[1] : "",
              amount: Number.isFinite(Number(p?.amount))
                ? Number(p.amount)
                : 0,
              grain: p.grain ?? ("day" as const),
            };
          })
          .filter((p: { date: string }) => /^\d{4}-\d{2}-\d{2}$/.test(p.date));
        setChartData(cleaned);
      }

      const rows: AdminLedgerTx[] = (json.ledger ?? [])
        .slice(0, MAX_BUFFER)
        .map((tx) => ({
          ...tx,
          userName: formatSellerName(tx.userName),
          method: formatMethod(tx.method) as AdminLedgerTx["method"],
          description:
            String(tx.description || "Pagamento PIX")
              .replace(/\b(undefined|null)\b/gi, "")
              .trim() || "Pagamento PIX",
          status: (tx.status || "pendente") as AdminTxStatus,
        }));

      if (opts?.silent && rows.length > 0) {
        const top = rows[0];
        if (top?.id && !knownIdsRef.current.has(top.id)) {
          setFlashId(top.id);
          window.setTimeout(() => {
            setFlashId((cur) => (cur === top.id ? null : cur));
          }, 1200);
        }
      }
      knownIdsRef.current = new Set(rows.map((r) => r.id));
      setLedger(rows);

      if (
        json.source === "mysql" ||
        json.source === "database" ||
        json.source === "mock"
      ) {
        setDataSource(json.source === "database" ? "mysql" : json.source);
      }
    } catch {
      /* silencioso */
    }
  }, [period.key]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadDashboard({ silent: true });
    }, LIVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loadDashboard]);

  const totalPages = Math.max(1, Math.ceil(ledger.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  const pageItems = useMemo(() => {
    const start = safePage * pageSize;
    return ledger.slice(start, start + pageSize);
  }, [ledger, safePage, pageSize]);

  useEffect(() => {
    if (!pageSizeOpen) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const el = pageSizeRootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setPageSizeOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPageSizeOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pageSizeOpen]);

  // Se o buffer encolher e a página atual sumir, volta uma página
  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  return (
    <div
      className="flex flex-col w-full min-w-0"
      style={{ gap: "var(--main-gap)" }}
    >
      {/* Topo 3 indicadores */}
      <div className="grid-kpi-3">
        <KpiCard
          icon={<IconDolarSymbol size={ICON} />}
          label="Volume processado"
          value={formatBRL(m.volumeProcessed)}
        />
        <KpiCard
          icon={<IconMoneyFlying size={ICON} />}
          label="Receita da plataforma"
          value={formatBRL(m.platformRevenue)}
        />
        <KpiCard
          icon={<IconTransferFilled size={ICON_TX} />}
          label="Total de transações"
          value={m.totalTransactions.toLocaleString("pt-BR")}
        />
      </div>

      {/* Meio gráfico + métricas */}
      <div className="grid-dash-main">
        <div className="min-w-0" style={{ minHeight: 280 }}>
          <RevenueChart
            data={chartData}
            period={period}
            onPeriodChange={setPeriod}
            title="Movimentações"
            yAxisLabel="Volume"
          />
        </div>

        <div className="min-w-0 metrics-stack">
          <div className="min-h-0 min-w-0">
            <KpiCard
              fill
              icon={<IconPercentFilled size={ICON} />}
              label="Ticket médio"
              value={formatBRL(m.averageTicket)}
            />
          </div>
          <div className="min-h-0 min-w-0">
            <KpiCard
              fill
              icon={<IconUsersFilled size={ICON} />}
              label="Total de usuários"
              value={String(m.totalUsers)}
            />
          </div>
          <div className="min-h-0 min-w-0">
            <KpiCard
              fill
              icon={<IconLockFilled size={ICON} />}
              label="Saldo retido total"
              value={formatBRL(m.totalHeldBalance)}
            />
          </div>
          <div className="min-h-0 min-w-0">
            <KpiCard
              fill
              icon={<IconCheckFilled size={ICON} />}
              label="Taxa de conversão"
              value={`${m.conversionRate.toLocaleString("pt-BR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}%`}
            />
          </div>
        </div>
      </div>

      {/* Histórico paginado + feed ao vivo (escadinha) */}
      <div
        className="surface-card overflow-hidden w-full"
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
                  "Sellers",
                  "Descrição",
                  "Método de pagamento",
                  "Valor",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 font-medium text-center"
                    style={{
                      fontSize: 12,
                      color: "var(--text-3)",
                      borderBottom: "1px solid var(--border-card)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((tx) => {
                const amount = formatAmount(tx);
                const tone = toneForTx(tx);
                const isNew = flashId === tx.id && safePage === 0;
                return (
                  <tr
                    key={tx.id}
                    style={{
                      background: isNew
                        ? "rgba(255,255,255,0.04)"
                        : "transparent",
                      transition: "background 0.6s ease",
                    }}
                  >
                    <AdminTd nowrap>{formatDateTime(tx.date)}</AdminTd>
                    <AdminTd nowrap>
                      <span
                        className="font-medium"
                        style={{
                          color: "var(--text-1)",
                          whiteSpace: "nowrap",
                          display: "inline-block",
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          verticalAlign: "bottom",
                        }}
                        title={formatSellerName(tx.userName)}
                      >
                        {formatSellerName(tx.userName)}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <span
                        style={{
                          whiteSpace: "nowrap",
                          display: "inline-block",
                          maxWidth: 220,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {String(tx.description || "Pagamento PIX")
                          .replace(/\b(undefined|null)\b/gi, "")
                          .trim() || "Pagamento PIX"}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <div className="flex items-center justify-center">
                        <span
                          className="flex shrink-0 items-center justify-center"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "var(--radius-sm)",
                            background: tone.iconBg,
                          }}
                          title={formatMethod(tx.method)}
                          aria-label={formatMethod(tx.method)}
                        >
                          <IconPixFilled size={14} tone={tone.iconTone} />
                        </span>
                      </div>
                    </AdminTd>
                    <AdminTd nowrap>
                      <span
                        className="tabular font-semibold"
                        style={{ color: amount.color, fontSize: 13 }}
                      >
                        {amount.text}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <AdminStatusBadge
                        label={statusLabel(tx.status)}
                        tone={statusTone(tx.status)}
                        spinning={isSpinning(tx.status)}
                      />
                    </AdminTd>
                  </tr>
                );
              })}
              {pageItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center"
                    style={{ fontSize: 13, color: "var(--text-3)" }}
                  >
                    Nenhuma venda via API de pagamento ainda
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/*
          Paginação:
          esquerda Página X de Y
          centro   Por página | N
          direita  Anterior / Próxima
        */}
        <div
          className="px-5 py-4 grid items-center gap-3"
          style={{
            borderTop: "1px solid var(--border-card)",
            gridTemplateColumns: "1fr auto 1fr",
          }}
        >
          {/* Esquerda: Página 1 de 2 */}
          <span
            className="tabular select-none justify-self-start"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#ffffff",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
            aria-label={`Página ${safePage + 1} de ${totalPages}`}
          >
            Página {safePage + 1} de {totalPages}
          </span>

          {/* Centro: seletor Por página | 40 ∨ */}
          <div
            ref={pageSizeRootRef}
            className="relative justify-self-center"
          >
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={pageSizeOpen}
              aria-controls={pageSizeMenuId}
              onClick={() => setPageSizeOpen((v) => !v)}
              className="inline-flex items-stretch overflow-hidden"
              style={{
                height: 40,
                borderRadius: 12,
                border: "1px solid #3a4150",
                background: "transparent",
                color: "#c8cdd6",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <span
                className="inline-flex items-center"
                style={{
                  padding: "0 14px",
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "#c8cdd6",
                  lineHeight: 1,
                }}
              >
                Por página
              </span>
              <span
                aria-hidden
                style={{
                  width: 1,
                  alignSelf: "stretch",
                  margin: "8px 0",
                  background: "#3a4150",
                }}
              />
              <span
                className="inline-flex items-center gap-1.5 tabular"
                style={{
                  padding: "0 12px 0 14px",
                  minWidth: 58,
                  justifyContent: "center",
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "#e8eaed",
                  lineHeight: 1,
                }}
              >
                {pageSize}
                <ChevronDown
                  size={15}
                  strokeWidth={2}
                  style={{
                    color: "#9aa3b2",
                    transform: pageSizeOpen ? "rotate(180deg)" : "none",
                    transition: "transform 120ms ease",
                  }}
                />
              </span>
            </button>

            {pageSizeOpen ? (
              <div
                id={pageSizeMenuId}
                role="listbox"
                aria-label="Itens por página"
                className="absolute left-1/2 bottom-full mb-2 overflow-hidden z-20"
                style={{
                  minWidth: "100%",
                  transform: "translateX(-50%)",
                  background: "var(--bg-card)",
                  border: "1px solid #3a4150",
                  borderRadius: 12,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
                }}
              >
                {PAGE_SIZE_OPTIONS.map((n) => {
                  const active = n === pageSize;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className="flex w-full items-center justify-center tabular font-medium transition-colors"
                      style={{
                        height: 38,
                        fontSize: 13.5,
                        border: "none",
                        background: active
                          ? "rgba(255,255,255,0.06)"
                          : "transparent",
                        color: active ? "#ffffff" : "#c8cdd6",
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setPageSize(n);
                        setPage(0);
                        setPageSizeOpen(false);
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background =
                            "rgba(255,255,255,0.04)";
                          e.currentTarget.style.color = "#ffffff";
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = active
                          ? "rgba(255,255,255,0.06)"
                          : "transparent";
                        e.currentTarget.style.color = active
                          ? "#ffffff"
                          : "#c8cdd6";
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Direita: Anterior / Próxima */}
          <div className="flex items-center justify-end gap-2 justify-self-end">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="inline-flex items-center justify-center font-semibold text-[12px] transition-opacity"
              style={{
                height: 34,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid var(--border-muted)",
                background: "var(--bg-elevated)",
                color: "var(--text-1)",
                cursor: safePage <= 0 ? "not-allowed" : "pointer",
                opacity: safePage <= 0 ? 0.4 : 1,
              }}
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() =>
                setPage((p) => Math.min(totalPages - 1, p + 1))
              }
              className="inline-flex items-center justify-center font-semibold text-[12px] transition-opacity"
              style={{
                height: 34,
                padding: "0 14px",
                borderRadius: 10,
                border: "none",
                background: "var(--green-use)",
                color: "var(--on-green)",
                cursor:
                  safePage >= totalPages - 1 ? "not-allowed" : "pointer",
                opacity: safePage >= totalPages - 1 ? 0.4 : 1,
              }}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
