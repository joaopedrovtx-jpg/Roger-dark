"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  IconOutflowFilled,
  IconClockFilled,
  IconCheckFilled,
  IconXFilled,
  IconDolarSymbol,
  IconMoneyFlying,
  IconPixFilled,
} from "@/components/dashboard/KpiIcons";
import { AdminMetricCard } from "./AdminMetricCard";
import { AdminStatusBadge } from "./AdminStatusBadge";
import { AdminTd, AdminActionButton } from "./AdminTable";
import { AdminSaqueDetailModal } from "./AdminSaqueDetailModal";
import { formatBRL, formatChartDate } from "@/lib/format";
import {
  adminSaquesMock,
  saqueFeeAmount,
  type AdminSaque,
  type AdminSaqueStatus,
} from "@/lib/mock/admin";

const ICON = 24;

type TabId = "todos" | AdminSaqueStatus;

const TABS: { id: TabId; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "processando", label: "Pendentes" },
  { id: "pago", label: "Aprovados" },
  { id: "recusado", label: "Recusados" },
];

function formatDateTime(iso: string): string {
  const date = formatChartDate(iso);
  const time = iso.includes("T") ? iso.split("T")[1].slice(0, 5) : "";
  return time ? `${date} ${time}` : date;
}

const PENDING_YELLOW = "#f5a623";
const RECUSADO_RED = "#ef4444";

function statusLabel(s: AdminSaqueStatus): string {
  return s === "pago" ? "Aprovado" : s === "recusado" ? "Recusado" : "Pendente";
}

function statusTone(
  s: AdminSaqueStatus
): "success" | "danger" | "warning" {
  return s === "pago" ? "success" : s === "recusado" ? "danger" : "warning";
}

/**
 * Valor + fundo do ícone Pix — mesmo padrão Financeiro / Transações
 * pendente → amarelo · recusado → vermelho · aprovado → branco + ícone preto
 */
function toneForStatus(s: AdminSaqueStatus): {
  color: string;
  iconBg: string;
  iconTone: "white" | "black";
} {
  switch (s) {
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

export function AdminSaquesView() {
  const [saques, setSaques] = useState<AdminSaque[]>([]);
  const [tab, setTab] = useState<TabId>("processando");
  const [search, setSearch] = useState("");
  const [selectedSaque, setSelectedSaque] = useState<AdminSaque | null>(null);
  const [source, setSource] = useState<"database" | "mock" | "loading">(
    "loading"
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = async () => {
    setLoadError(null);
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch("/api/v1/admin/saques");
      const json = (await res.json()) as {
        source?: string;
        items?: AdminSaque[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || `Falha ao carregar saques (${res.status})`);
      }
      // Banco real mesmo se lista vazia — NÃO cair no mock de demo
      setSaques(json.items ?? []);
      setSource(
        json.source === "mysql" || json.source === "database"
          ? "database"
          : "mock"
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Erro ao carregar");
      // só mock se API falhar de verdade
      setSaques(adminSaquesMock);
      setSource("mock");
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const metrics = useMemo(() => {
    const processando = saques.filter((s) => s.status === "processando");
    const pagos = saques.filter((s) => s.status === "pago");
    const recusados = saques.filter((s) => s.status === "recusado");
    return {
      totalOut: pagos.reduce((a, s) => a + s.amount, 0),
      pendingCount: processando.length,
      pendingAmount: processando.reduce((a, s) => a + s.amount, 0),
      paidCount: pagos.length,
      rejectedCount: recusados.length,
      /** Lucro = taxas cobradas nos saques aprovados */
      lucroSobreSaque: pagos.reduce((a, s) => a + saqueFeeAmount(s), 0),
    };
  }, [saques]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return saques.filter((s) => {
      if (tab !== "todos" && s.status !== tab) return false;
      if (!q) return true;
      return (
        s.userName.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.destination.toLowerCase().includes(q)
      );
    });
  }, [saques, tab, search]);

  async function setStatus(id: string, status: AdminSaqueStatus) {
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch(
        `/api/v1/admin/withdrawals/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Falha ao atualizar saque");
      }
      await reload();
      setSelectedSaque((cur) =>
        cur && cur.id === id ? { ...cur, status } : cur
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Erro ao atualizar");
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <AdminSaqueDetailModal
        open={!!selectedSaque}
        saque={selectedSaque}
        onClose={() => setSelectedSaque(null)}
        onStatusChange={setStatus}
      />
      {loadError ? (
        <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{loadError}</p>
      ) : null}
      {source === "database" ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-3)" }}>
          Conectado ao banco · saques solicitados pelos sellers em Financeiro
        </p>
      ) : source === "mock" ? (
        <p style={{ margin: 0, fontSize: 12, color: "#fbbf24" }}>
          Exibindo dados mock — faça login como admin e confira o banco
        </p>
      ) : null}
      {/* Linha 1 — 3 indicadores */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
        }}
      >
        <AdminMetricCard
          icon={<IconOutflowFilled size={ICON} />}
          label="Total pago (saques)"
          value={formatBRL(metrics.totalOut)}
        />
        <AdminMetricCard
          icon={<IconDolarSymbol size={ICON} />}
          label="Valor esperando liberação"
          value={formatBRL(metrics.pendingAmount)}
        />
        <AdminMetricCard
          icon={<IconMoneyFlying size={ICON} />}
          label="Lucro sobre saque"
          value={formatBRL(metrics.lucroSobreSaque)}
        />
      </div>

      {/* Linha 2 — 3 indicadores */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
        }}
      >
        <AdminMetricCard
          icon={<IconCheckFilled size={ICON} />}
          label="Saques aprovados"
          value={String(metrics.paidCount)}
        />
        <AdminMetricCard
          icon={<IconClockFilled size={ICON} />}
          label="Saques pendentes"
          value={String(metrics.pendingCount)}
        />
        <AdminMetricCard
          icon={<IconXFilled size={ICON} />}
          label="Saques recusados"
          value={String(metrics.rejectedCount)}
        />
      </div>

      {/* Abas + busca */}
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
          aria-label="Filtrar saques"
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
            placeholder="Buscar por usuário, ID ou chave…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 outline-none border-0 bg-transparent"
            style={{
              height: "100%",
              fontSize: 13.5,
              color: "var(--text-1)",
              padding: 0,
            }}
          />
        </div>
      </div>

      <div
        className="surface-card overflow-hidden"
        style={{ borderRadius: "var(--radius-card)" }}
        role="tabpanel"
      >
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "ID",
                  "Data",
                  "Usuário",
                  "Chave PIX",
                  "Valor",
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
              {filtered.map((row) => {
                const tone = toneForStatus(row.status);
                return (
                <tr key={row.id}>
                  <AdminTd nowrap>
                    <span className="tabular" style={{ fontSize: 12 }}>
                      {row.id}
                    </span>
                  </AdminTd>
                  <AdminTd nowrap>{formatDateTime(row.date)}</AdminTd>
                  <AdminTd>
                    <span
                      style={{ color: "var(--text-1)", fontWeight: 500 }}
                    >
                      {row.userName}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    {/* Bloco fixo: ícones Pix alinhados entre linhas */}
                    <div className="flex items-center justify-center">
                      <div
                        className="flex items-center gap-2.5"
                        style={{ width: 200, maxWidth: "100%" }}
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
                          className="truncate min-w-0"
                          style={{ fontSize: 13, color: "var(--text-2)" }}
                        >
                          {row.destination}
                        </span>
                      </div>
                    </div>
                  </AdminTd>
                  <AdminTd nowrap>
                    <span
                      className="tabular font-semibold"
                      style={{ fontSize: 13, color: tone.color }}
                    >
                      {formatBRL(row.amount)}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <AdminStatusBadge
                      label={statusLabel(row.status)}
                      tone={statusTone(row.status)}
                      spinning={row.status === "processando"}
                    />
                  </AdminTd>
                  <AdminTd>
                    {/* Aprovar / Recusar só no modal (botão Ver) */}
                    <div className="flex items-center justify-center">
                      <AdminActionButton
                        variant="primary"
                        onClick={() => setSelectedSaque(row)}
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
                    colSpan={7}
                    className="px-4 py-10 text-center"
                    style={{ fontSize: 13, color: "var(--text-3)" }}
                  >
                    Nenhum saque nesta aba
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
