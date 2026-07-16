"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  IconCheckFilled,
  IconClockFilled,
  IconXFilled,
  IconDolarSymbol,
  IconBancoFilled,
  IconTransferFilled,
  IconPercentFilled,
  IconOutflowFilled,
} from "@/components/dashboard/KpiIcons";
import {
  PeriodFilter,
  type PeriodKey,
  type PeriodValue,
} from "@/components/dashboard/PeriodFilter";
import { AdminMetricCard } from "./AdminMetricCard";
import { AdminStatusBadge } from "./AdminStatusBadge";
import { AdminTd, AdminActionButton } from "./AdminTable";
import { AdminAdquirenteDetailModal } from "./AdminAdquirenteDetailModal";
import { AdminPagamentoConfigView } from "./AdminPagamentoConfigView";
import { formatBRL } from "@/lib/format";
import {
  adquirentesMock,
  adminLedgerMock,
  type Adquirente,
  type AdquirenteStatus,
} from "@/lib/mock/admin";

type PageSection = "rota" | "credenciais";

const ICON = 24;

const DEFAULT_PERIOD: PeriodValue = {
  key: "30d",
  label: "Últimos 30 dias",
};

/** Fator mock de volume/TXs conforme o filtro de período */
function periodScale(key: PeriodKey): number {
  switch (key) {
    case "today":
      return 0.04;
    case "yesterday":
      return 0.035;
    case "7d":
      return 0.28;
    case "15d":
      return 0.52;
    case "30d":
      return 1;
    case "60d":
      return 1.85;
    default:
      return 1;
  }
}

type TabId = "todos" | AdquirenteStatus;

const TABS: { id: TabId; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "ativo", label: "Ativos" },
  { id: "manutencao", label: "Manutenção" },
  { id: "inativo", label: "Inativos" },
];

/** Taxas da adquirente já pagas: MDR % sobre o volume + taxa fixa por TX */
function taxasPagasAdquirente(a: Adquirente, scale = 1): number {
  const volume = a.volumeMes * scale;
  const txs = a.transactionsMes * scale;
  return volume * (a.feePercent / 100) + txs * a.feeFixed;
}

function statusLabel(s: AdquirenteStatus): string {
  if (s === "ativo") return "Ativo";
  if (s === "manutencao") return "Manutenção";
  return "Inativo";
}

function statusTone(
  s: AdquirenteStatus
): "success" | "warning" | "danger" {
  if (s === "ativo") return "success";
  if (s === "manutencao") return "warning";
  return "danger";
}

/**
 * Cor da linha inteira conforme status (mesmo padrão usuários/saques):
 * ativo → branco · manutenção → amarelo · inativa → vermelho
 */
function rowColor(s: AdquirenteStatus): string {
  if (s === "manutencao") return "#f5a623";
  if (s === "inativo") return "#ef4444";
  return "#ffffff";
}

export function AdminAdquirentesView() {
  const [section, setSection] = useState<PageSection>("rota");
  const [items, setItems] = useState<Adquirente[]>(adquirentesMock);
  const [tab, setTab] = useState<TabId>("todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Adquirente | null>(null);
  const [period, setPeriod] = useState<PeriodValue>(DEFAULT_PERIOD);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { authedFetch } = await import("@/lib/client/session");
        const res = await authedFetch("/api/v1/admin/acquirers");
        if (!res.ok) return;
        const json = (await res.json()) as { items?: Adquirente[] };
        if (!cancelled && json.items?.length) {
          setItems(
            json.items.map((a) => ({
              id: a.id,
              name: a.name,
              code: a.code,
              status: a.status,
              feePercent: a.feePercent,
              feeFixed: a.feeFixed,
              volumeMes: a.volumeMes,
              transactionsMes: a.transactionsMes,
              settlement: a.settlement,
              priority: a.priority,
              conversionRate: a.conversionRate,
            }))
          );
        }
      } catch {
        /* mock */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scale = periodScale(period.key);

  const metrics = useMemo(() => {
    const volumeBase = items.reduce((sum, a) => sum + a.volumeMes, 0);
    const txsBase = items.reduce((sum, a) => sum + a.transactionsMes, 0);
    const volume = volumeBase * scale;
    const txs = Math.round(txsBase * scale);
    const ticketMedio = txs > 0 ? volume / txs : 0;

    // Soma das taxas da adquirente já pagas (MDR + fixa) no período
    const taxasPagas = items.reduce(
      (sum, a) => sum + taxasPagasAdquirente(a, scale),
      0
    );

    return {
      total: items.length,
      ativos: items.filter((a) => a.status === "ativo").length,
      manutencao: items.filter((a) => a.status === "manutencao").length,
      inativos: items.filter((a) => a.status === "inativo").length,
      volume,
      txs,
      taxasPagas,
      ticketMedio,
    };
  }, [items, scale]);

  /** Reembolsos no período (escala com o filtro) */
  const reembolsados = useMemo(() => {
    const count = adminLedgerMock.filter(
      (t) => t.kind === "venda" && t.status === "reembolsada"
    ).length;
    return Math.max(0, Math.round(count * scale));
  }, [scale]);

  const ordered = useMemo(
    () => [...items].sort((a, b) => a.priority - b.priority),
    [items]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ordered.filter((a) => {
      if (tab !== "todos" && a.status !== tab) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.settlement.toLowerCase().includes(q)
      );
    });
  }, [ordered, tab, search]);

  const topTaxasPagasId = useMemo(() => {
    const comVolume = items.filter((a) => a.volumeMes > 0 || a.transactionsMes > 0);
    if (comVolume.length === 0) return null;
    return comVolume.reduce((best, cur) =>
      taxasPagasAdquirente(cur) > taxasPagasAdquirente(best) ? cur : best
    ).id;
  }, [items]);

  async function setStatus(id: string, status: AdquirenteStatus) {
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch(
        `/api/v1/admin/acquirers/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        console.error(j.error || res.status);
      }
    } catch {
      /* local */
    }
    setItems((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    setSelected((cur) =>
      cur && cur.id === id ? { ...cur, status } : cur
    );
  }

  async function movePriority(id: string, dir: -1 | 1) {
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch(
        `/api/v1/admin/acquirers/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ priorityDir: dir }),
        }
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        console.error(j.error || res.status);
      }
    } catch {
      /* local */
    }
    const sorted = [...items].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex((a) => a.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swap];
    const next = items.map((item) => {
      if (item.id === a.id) return { ...item, priority: b.priority };
      if (item.id === b.id) return { ...item, priority: a.priority };
      return item;
    });
    setItems(next);
    if (selected) {
      const refreshed = next.find((x) => x.id === selected.id);
      if (refreshed) setSelected(refreshed);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <AdminAdquirenteDetailModal
        open={!!selected}
        adquirente={selected}
        onClose={() => setSelected(null)}
        onStatusChange={setStatus}
        onMovePriority={movePriority}
        maxPriority={items.length}
      />

      {/* Rota (lista/métricas) · Credenciais (chaves públicas/privadas) */}
      <div
        className="inline-flex items-center self-start surface-card"
        style={{
          padding: 4,
          borderRadius: "var(--radius-md)",
          gap: 2,
        }}
        role="tablist"
        aria-label="Seções de adquirentes"
      >
        {(
          [
            { id: "rota" as const, label: "Gerenciamento" },
            { id: "credenciais" as const, label: "Credenciais" },
          ] as const
        ).map((s) => {
          const on = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSection(s.id)}
              style={{
                height: 36,
                padding: "0 16px",
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: "pointer",
                fontSize: 13.5,
                fontWeight: on ? 650 : 500,
                background: on ? "#ffffff" : "transparent",
                color: on ? "#0a0f0c" : "var(--text-2)",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {section === "credenciais" ? <AdminPagamentoConfigView /> : null}

      {section === "rota" ? (
        <>
      {/* Filtro de período (mesmo botão/funil do dashboard) */}
      <div className="flex items-center justify-end w-full">
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {/* Linha 1 — volume / transações / total */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
        }}
      >
        <AdminMetricCard
          icon={<IconDolarSymbol size={ICON} />}
          label="Volume total"
          value={formatBRL(metrics.volume)}
        />
        <AdminMetricCard
          icon={<IconTransferFilled size={28} />}
          label="Total de transações"
          value={metrics.txs.toLocaleString("pt-BR")}
        />
        <AdminMetricCard
          icon={<IconBancoFilled size={ICON} />}
          label="Total de adquirentes"
          value={String(metrics.total)}
        />
      </div>

      {/* Linha 2 — status das adquirentes */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
        }}
      >
        <AdminMetricCard
          icon={<IconCheckFilled size={ICON} />}
          label="Adquirentes ativos"
          value={String(metrics.ativos)}
        />
        <AdminMetricCard
          icon={<IconClockFilled size={ICON} />}
          label="Adquirentes em manutenção"
          value={String(metrics.manutencao)}
        />
        <AdminMetricCard
          icon={<IconXFilled size={ICON} />}
          label="Adquirentes inativas"
          value={String(metrics.inativos)}
        />
      </div>

      {/* Linha 3 — performance da rota / adquirência */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
        }}
      >
        <AdminMetricCard
          icon={<IconPercentFilled size={ICON} />}
          label="Taxas pagas"
          value={formatBRL(metrics.taxasPagas)}
        />
        <AdminMetricCard
          icon={<IconTransferFilled size={28} />}
          label="Ticket médio"
          value={formatBRL(metrics.ticketMedio)}
        />
        <AdminMetricCard
          icon={<IconOutflowFilled size={ICON} />}
          label="Reembolsados"
          value={String(reembolsados)}
          valueColor="#ffffff"
        />
      </div>

      {/* Abas + busca — padrão saques / gerentes */}
      <div
        className="flex flex-wrap items-center w-full min-w-0"
        style={{ gap: 10 }}
      >
        <div
          className="inline-flex items-center surface-card shrink-0"
          style={{
            padding: 4,
            borderRadius: "var(--radius-md)",
            gap: 2,
          }}
          role="tablist"
          aria-label="Filtrar adquirentes"
        >
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                style={{
                  height: 34,
                  padding: "0 16px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: on ? 650 : 500,
                  background: on ? "#ffffff" : "transparent",
                  color: on ? "#0a0f0c" : "var(--text-2)",
                  boxShadow: "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div
          className="flex items-center gap-2 min-w-0 surface-card"
          style={{
            height: 42,
            width: 280,
            maxWidth: "100%",
            padding: "0 12px 0 10px",
            borderRadius: "var(--radius-md)",
            boxSizing: "border-box",
          }}
        >
          <Search
            size={16}
            strokeWidth={1.75}
            style={{ color: "var(--text-3)", flexShrink: 0 }}
            aria-hidden
          />
          <input
            type="search"
            placeholder="Buscar por nome, código ou ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 outline-none border-0 bg-transparent"
            style={{
              height: "100%",
              fontSize: 13.5,
              color: "var(--text-1)",
              padding: 0,
              fontFamily: "inherit",
            }}
          />
        </div>
      </div>

      {/* Tabela — ações de status só no modal (Ver) */}
      <div
        className="surface-card overflow-hidden"
        style={{ borderRadius: "var(--radius-card)" }}
        role="tabpanel"
        aria-label={TABS.find((t) => t.id === tab)?.label ?? "Adquirentes"}
      >
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Rota",
                  "Código",
                  "Nome",
                  "Liquidação",
                  "Volume",
                  "Transações",
                  "Taxas pagas",
                  "Status",
                  "",
                ].map((h) => (
                  <th
                    key={h || "acoes"}
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
              {filtered.map((a) => {
                const color = rowColor(a.status);
                const isPrincipal = a.priority === 1;
                return (
                  <tr key={a.id}>
                    <AdminTd nowrap>
                      <span
                        className="inline-flex items-center gap-1.5 font-semibold tabular"
                        style={{ fontSize: 12.5 }}
                      >
                        <span style={{ color }}>#{a.priority}</span>
                        {isPrincipal ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#0a0f0c",
                              background:
                                a.status === "manutencao"
                                  ? "#f5a623"
                                  : a.status === "inativo"
                                    ? "#ef4444"
                                    : "#ffffff",
                              borderRadius: 8,
                              padding: "1px 6px",
                            }}
                          >
                            Principal
                          </span>
                        ) : null}
                      </span>
                    </AdminTd>
                    <AdminTd nowrap>
                      <span
                        className="font-semibold tabular"
                        style={{ fontSize: 12, color }}
                      >
                        {a.code}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <span className="font-medium" style={{ color }}>
                        {a.name}
                      </span>
                    </AdminTd>
                    <AdminTd nowrap>
                      <span
                        className="font-semibold"
                        style={{ color, fontSize: 13 }}
                      >
                        {a.settlement}
                      </span>
                    </AdminTd>
                    <AdminTd nowrap>
                      <span
                        className="tabular font-semibold"
                        style={{ fontSize: 13, color }}
                      >
                        {formatBRL(a.volumeMes)}
                      </span>
                    </AdminTd>
                    <AdminTd nowrap>
                      <span
                        className="tabular font-semibold"
                        style={{ fontSize: 13, color }}
                      >
                        {a.transactionsMes.toLocaleString("pt-BR")}
                      </span>
                    </AdminTd>
                    <AdminTd nowrap>
                      <span
                        className="inline-flex items-center justify-center gap-1.5 tabular font-semibold"
                        style={{ fontSize: 13, color }}
                      >
                        {formatBRL(taxasPagasAdquirente(a))}
                        {a.id === topTaxasPagasId ? (
                          <span
                            className="font-semibold"
                            style={{
                              fontSize: 10,
                              color: "#0a0f0c",
                              background: "#ffffff",
                              borderRadius: 8,
                              padding: "1px 6px",
                            }}
                          >
                            Maior
                          </span>
                        ) : null}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <AdminStatusBadge
                        label={statusLabel(a.status)}
                        tone={statusTone(a.status)}
                        spinning={a.status === "manutencao"}
                      />
                    </AdminTd>
                    <AdminTd>
                      <div className="flex items-center justify-center">
                        <AdminActionButton
                          variant="primary"
                          onClick={() => setSelected(a)}
                        >
                          Ver
                        </AdminActionButton>
                      </div>
                    </AdminTd>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center"
                    style={{ fontSize: 13, color: "var(--text-3)" }}
                  >
                    Nenhum adquirente nesta aba
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
        </>
      ) : null}
    </div>
  );
}
