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
  adminVolumeHistoryMock,
  adminLedgerMock,
  type AdminMetrics,
  type AdminTxStatus,
  type AdminLedgerTx,
} from "@/lib/mock/admin";

const ICON = 24;
const ICON_TX = 28;

/** Opções do seletor “Por página” (como na referência) */
const PAGE_SIZE_OPTIONS = [5, 10, 20, 40] as const;
/** Tamanho máximo do buffer em memória (escadinha: novas empurram as antigas) */
const MAX_BUFFER = 80;
/** Intervalo do feed “ao vivo” (ms) */
const LIVE_INTERVAL_MS = 4500;

const DEFAULT_PERIOD: PeriodValue = {
  key: "7d",
  label: "Últimos 7 dias",
};

const LIVE_USERS = [
  "Ana Souza",
  "Bruno Lima",
  "Carla Mendes",
  "Diego Alves",
  "Elena Costa",
  "Felipe Rocha",
  "Gabriela Nunes",
  "Hugo Martins",
  "Isabela Freitas",
  "Igor Rocha",
];

const LIVE_PRODUCTS = [
  "Curso Digital Pro",
  "Mentoria 1:1",
  "E-book Premium",
  "Assinatura Mensal",
  "Pack Templates",
  "Workshop Live",
  "Consultoria",
];

function formatDateTime(iso: string): string {
  const date = formatChartDate(iso);
  const time = iso.includes("T") ? iso.split("T")[1].slice(0, 5) : "";
  return time ? `${date} ${time}` : date;
}

function statusLabel(status: AdminTxStatus): string {
  const map: Record<AdminTxStatus, string> = {
    pendente: "Pendente",
    // Pagamento aprovado e saque aprovado usam o mesmo rótulo
    aprovada: "Aprovado",
    recusada: "Recusada",
    reembolsada: "Reembolso",
    pago: "Aprovado",
    processando: "Pendente",
    recusado: "Recusado",
  };
  return map[status];
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function nowIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomAmount(min: number, max: number): number {
  const n = min + Math.random() * (max - min);
  return Math.round(n * 100) / 100;
}

/** Gera uma transação nova (venda ou saque) para o feed ao vivo */
function createLiveTx(seq: number): AdminLedgerTx {
  // Mix equilibrado: pagamentos (aprovações) + saques (pendente e aprovado)
  const roll = Math.random();
  const userName = randomItem(LIVE_USERS);

  // ~35% saque (pendente ou aprovado), ~65% pagamento
  if (roll < 0.35) {
    // Metade pendente, metade aprovado — não só saque pendente
    const saqueStatus: AdminTxStatus =
      Math.random() < 0.5 ? "processando" : "pago";
    return {
      id: `SQ-L${String(seq).padStart(5, "0")}`,
      date: nowIso(),
      userName,
      kind: "saque",
      direction: "saida",
      description: "Saque",
      method: "PIX",
      amount: randomAmount(500, 18_000),
      status: saqueStatus,
    };
  }

  // Pagamentos: maioria aprovada + pendente/recusada
  const statuses: AdminTxStatus[] = [
    "aprovada",
    "aprovada",
    "aprovada",
    "aprovada",
    "pendente",
    "recusada",
  ];
  return {
    id: `TX-L${String(seq).padStart(5, "0")}`,
    date: nowIso(),
    userName,
    kind: "venda",
    direction: "entrada",
    description: randomItem(LIVE_PRODUCTS),
    method: "PIX",
    amount: randomAmount(29.9, 2_500),
    status: randomItem(statuses),
  };
}

/**
 * Layout espelhado da Dashboard de usuário:
 * 1) 3 indicadores no topo
 * 2) gráfico (2 cols) + 4 métricas empilhadas (1 col)
 * 3) histórico paginado (10) com feed ao vivo (escadinha)
 */
export function AdminDashboardView() {
  const [period, setPeriod] = useState<PeriodValue>(DEFAULT_PERIOD);
  const [m, setMetrics] = useState<AdminMetrics>(adminMetricsMock);
  const [chartData, setChartData] = useState(adminVolumeHistoryMock);
  const [dataSource, setDataSource] = useState<"mysql" | "mock">("mock");

  /** Buffer em memória — novas no topo; quando passa de MAX_BUFFER, cai a mais antiga */
  const [ledger, setLedger] = useState<AdminLedgerTx[]>(() =>
    adminLedgerMock.slice(0, MAX_BUFFER)
  );
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(40);
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const seqRef = useRef(1);
  const pageSizeRootRef = useRef<HTMLDivElement>(null);
  const pageSizeMenuId = useId();

  /** Carrega metrics + gráfico + histórico do backend (banco real) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { authedFetch } = await import("@/lib/client/session");
        const res = await authedFetch("/api/v1/admin/dashboard");
        if (!res.ok) return;
        const json = (await res.json()) as {
          source?: "mysql" | "mock" | "database";
          metrics?: AdminMetrics;
          volumeHistory?: typeof adminVolumeHistoryMock;
          ledger?: AdminLedgerTx[];
        };
        if (cancelled) return;
        if (json.metrics) setMetrics(json.metrics);
        // Aceita histórico/ledger reais mesmo vazios parciais
        if (json.volumeHistory) setChartData(json.volumeHistory);
        if (json.ledger) {
          setLedger(json.ledger.slice(0, MAX_BUFFER));
        }
        if (
          json.source === "mysql" ||
          json.source === "database" ||
          json.source === "mock"
        ) {
          setDataSource(json.source === "database" ? "mysql" : json.source);
        }
      } catch {
        /* mantém mock local */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period.key]);

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

  /** Nova entra no topo; se estourar o buffer, remove a última (escadinha) */
  const pushLiveTx = useCallback(() => {
    const tx = createLiveTx(seqRef.current++);
    setLedger((prev) => {
      const next = [tx, ...prev];
      if (next.length > MAX_BUFFER) next.length = MAX_BUFFER;
      return next;
    });
    // Se o admin estiver na 1ª página, a nova aparece no topo; senão mantém a página
    setFlashId(tx.id);
    window.setTimeout(() => {
      setFlashId((cur) => (cur === tx.id ? null : cur));
    }, 1200);
  }, []);

  useEffect(() => {
    const id = window.setInterval(pushLiveTx, LIVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [pushLiveTx]);

  // Se o buffer encolher e a página atual sumir, volta uma página
  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  return (
    <div
      className="flex flex-col w-full min-w-0"
      style={{ gap: "var(--main-gap)" }}
    >
      {/* Topo — 3 indicadores */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
        }}
      >
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

      {/* Meio — gráfico 2 cols + 4 métricas */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
          alignItems: "stretch",
        }}
      >
        <div
          className="min-w-0"
          style={{ gridColumn: "1 / 3", height: 360 }}
        >
          <RevenueChart
            data={chartData}
            period={period}
            onPeriodChange={setPeriod}
            title="Volume"
            yAxisLabel="Volume"
          />
        </div>

        <div
          className="min-w-0 grid h-full"
          style={{
            gridColumn: "3 / 4",
            height: 360,
            gridTemplateRows: "1fr 1fr 1fr 1fr",
            gap: "var(--kpi-gap)",
            alignItems: "stretch",
          }}
        >
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
                    <AdminTd>
                      <span
                        className="font-medium"
                        style={{ color: "var(--text-1)" }}
                      >
                        {tx.userName}
                      </span>
                    </AdminTd>
                    <AdminTd>{tx.description}</AdminTd>
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
                    Nenhuma transação no momento
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/*
          Paginação:
          esquerda — Página X de Y
          centro   — Por página | N
          direita  — Anterior / Próxima
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
