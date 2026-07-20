"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  IconUsersFilled,
  IconCheckFilled,
  IconLockFilled,
  IconGerenteFilled,
} from "@/components/dashboard/KpiIcons";
import { AdminMetricCard } from "./AdminMetricCard";
import { AdminStatusBadge } from "./AdminStatusBadge";
import { AdminTd, AdminActionButton } from "./AdminTable";
import { AdminGerenteDetailModal } from "./AdminGerenteDetailModal";
import { AdminGerenteCreateModal } from "./AdminGerenteCreateModal";
import { formatBRL, formatChartDate } from "@/lib/format";
import { type AdminGerente, type GerenteStatus } from "@/lib/mock/admin";
import { authedFetch } from "@/lib/client/session";

const ICON = 24;

type TabId = "todos" | GerenteStatus;

/** Abas no mesmo padrão da página de usuários */
const TABS: { id: TabId; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "ativo", label: "Ativos" },
  { id: "inativo", label: "Inativos" },
];

function formatDateTime(iso: string): string {
  const date = formatChartDate(iso);
  const time = iso.includes("T") ? iso.split("T")[1].slice(0, 5) : "";
  return time ? `${date} ${time}` : date;
}

function mapGerente(g: AdminGerente): AdminGerente {
  return {
    ...g,
    phone: g.phone ?? "",
    document: g.document ?? "",
    permissions: (g.permissions ?? []) as AdminGerente["permissions"],
  };
}

export function AdminGerentesView() {
  const [gerentes, setGerentes] = useState<AdminGerente[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("todos");
  const [search, setSearch] = useState("");
  const [selectedGerente, setSelectedGerente] =
    useState<AdminGerente | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function loadManagers() {
    try {
      const res = await authedFetch("/api/v1/admin/managers");
      if (!res.ok) throw new Error("fail");
      const json = (await res.json()) as { items?: AdminGerente[] };
      setGerentes((json.items ?? []).map(mapGerente));
    } catch {
      setGerentes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await authedFetch("/api/v1/admin/managers");
        if (!res.ok) throw new Error("fail");
        const json = (await res.json()) as { items?: AdminGerente[] };
        if (!cancelled) {
          setGerentes((json.items ?? []).map(mapGerente));
        }
      } catch {
        if (!cancelled) setGerentes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    return {
      total: gerentes.length,
      ativo: gerentes.filter((g) => g.status === "ativo").length,
      inativo: gerentes.filter((g) => g.status === "inativo").length,
      sellers: gerentes.reduce((a, g) => a + (g.sellersCount || 0), 0),
    };
  }, [gerentes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return gerentes.filter((g) => {
      if (tab !== "todos" && g.status !== tab) return false;
      if (!q) return true;
      if (g.name.toLowerCase().includes(q)) return true;
      if (g.email.toLowerCase().includes(q)) return true;
      if (g.id.toLowerCase().includes(q)) return true;
      if (qDigits.length >= 3 && (g.document || "").replace(/\D/g, "").includes(qDigits)) {
        return true;
      }
      return false;
    });
  }, [gerentes, tab, search]);

  async function setStatus(id: string, status: GerenteStatus) {
    try {
      await authedFetch(`/api/v1/admin/managers/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch {
      /* local */
    }
    setGerentes((prev) =>
      prev.map((g) => (g.id === id ? { ...g, status } : g))
    );
    setSelectedGerente((cur) =>
      cur && cur.id === id ? { ...cur, status } : cur
    );
  }

  function handleCreate(gerente: AdminGerente) {
    setGerentes((prev) => [mapGerente(gerente), ...prev]);
    setTab("todos");
    setSearch("");
    void loadManagers();
  }

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <AdminGerenteDetailModal
        open={!!selectedGerente}
        gerente={selectedGerente}
        onClose={() => setSelectedGerente(null)}
        onStatusChange={setStatus}
      />
      <AdminGerenteCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        existingEmails={gerentes.map((g) => g.email)}
      />
      {/* Indicadores — 4 cards; botão Novo gerente acima de Sellers sob gestão */}
      <div
        className="grid w-full items-end"
        style={{
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
        }}
      >
        <AdminMetricCard
          icon={<IconGerenteFilled size={ICON} />}
          label="Total de gerentes"
          value={String(counts.total)}
        />
        <AdminMetricCard
          icon={<IconCheckFilled size={ICON} />}
          label="Gerentes ativos"
          value={String(counts.ativo)}
        />
        <AdminMetricCard
          icon={<IconLockFilled size={ICON} />}
          label="Gerentes inativos"
          value={String(counts.inativo)}
        />
        <div className="flex flex-col w-full items-end" style={{ gap: 10 }}>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
            style={{
              height: 42,
              padding: "0 12px",
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "#ffffff",
              color: "#0a0f0c",
              fontSize: 13.5,
              cursor: "pointer",
              width: "fit-content",
            }}
          >
            Novo gerente
          </button>
          <AdminMetricCard
            icon={<IconUsersFilled size={ICON} />}
            label="Sellers sob gestão"
            value={String(counts.sellers)}
          />
        </div>
      </div>

      {/* Abas + busca lado a lado */}
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
          aria-label="Filtrar gerentes"
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
            placeholder="Buscar por nome, e-mail ou CPF…"
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

      {/* Conteúdo da aba ativa */}
      <div
        className="surface-card overflow-hidden"
        style={{ borderRadius: "var(--radius-card)" }}
        role="tabpanel"
        aria-label={TABS.find((t) => t.id === tab)?.label ?? "Gerentes"}
      >
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "ID",
                  "Gerente",
                  "Telefone",
                  "Sellers",
                  "Volume",
                  "Data e hora",
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
              {filtered.map((g) => (
                <tr key={g.id}>
                  <AdminTd nowrap>
                    <span className="tabular" style={{ fontSize: 12 }}>
                      {g.id}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <span
                      className="font-medium"
                      style={{ color: "var(--text-1)" }}
                    >
                      {g.name}
                    </span>
                  </AdminTd>
                  <AdminTd bold nowrap>
                    {g.phone}
                  </AdminTd>
                  <AdminTd bold>{g.sellersCount}</AdminTd>
                  <AdminTd bold nowrap>
                    {formatBRL(g.volumeTotal)}
                  </AdminTd>
                  <AdminTd bold nowrap>
                    {formatDateTime(g.createdAt)}
                  </AdminTd>
                  <AdminTd>
                    <AdminStatusBadge
                      label={g.status === "ativo" ? "Ativo" : "Inativo"}
                      tone={g.status === "ativo" ? "success" : "muted"}
                    />
                  </AdminTd>
                  <AdminTd>
                    <AdminActionButton
                      variant="primary"
                      onClick={() => setSelectedGerente(g)}
                    >
                      Ver
                    </AdminActionButton>
                  </AdminTd>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center"
                    style={{ fontSize: 13, color: "var(--text-3)" }}
                  >
                    {loading
                      ? "Carregando gerentes…"
                      : gerentes.length === 0
                        ? "Nenhum gerente no banco. Clique em Novo gerente e busque um seller por nome, e-mail ou CPF."
                        : "Nenhum gerente nesta aba"}
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
