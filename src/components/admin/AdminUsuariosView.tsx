"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  IconUsersFilled,
  IconCheckFilled,
  IconClockFilled,
  IconLockFilled,
  IconTransferFilled,
  IconMoneyFlying,
} from "@/components/dashboard/KpiIcons";
import { AdminMetricCard } from "./AdminMetricCard";
import { AdminTd, AdminActionButton } from "./AdminTable";
import { AdminUserDetailModal } from "./AdminUserDetailModal";
import { formatDateTime } from "@/lib/format";
import {
  adminUsersMock,
  type AdminUser,
  type UserStatus,
} from "@/lib/mock/admin";

const ICON = 24;

/** Data de referência do mock (alinha “hoje” / “novos” com os cadastros) */
const REF_TODAY = "2025-12-23";

type TabId = "todos" | UserStatus;

/** Abas no mesmo padrão de Informações / Documentos (CadastroContaView) */
const TABS: { id: TabId; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "ativo", label: "Ativos" },
  { id: "pendente", label: "Pendentes" },
  { id: "bloqueado", label: "Bloqueados" },
];

function dayStart(iso: string): number {
  return new Date(iso.slice(0, 10) + "T00:00:00").getTime();
}

/** CPF ou CNPJ prioriza CNPJ da empresa quando existir */
function documentLabel(u: AdminUser): string {
  if (u.cnpj?.trim()) return u.cnpj;
  return u.document;
}

export function AdminUsuariosView() {
  /** Em produção nunca seedar com mock — lista vazia até a API responder */
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tab, setTab] = useState<TabId>("todos");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [apiCounts, setApiCounts] = useState<{
    total: number;
    ativo: number;
    pendente: number;
    bloqueado: number;
    hoje: number;
    novos: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { authedFetch } = await import("@/lib/client/session");
        const res = await authedFetch("/api/v1/admin/users?pageSize=200");
        if (!res.ok) {
          if (!cancelled) setUsers([]);
          return;
        }
        const json = (await res.json()) as {
          items?: AdminUser[];
          metrics?: {
            total: number;
            ativo: number;
            pendente: number;
            bloqueado: number;
            hoje: number;
            novos: number;
          };
        };
        if (cancelled) return;
        setUsers(Array.isArray(json.items) ? (json.items as AdminUser[]) : []);
        if (json.metrics) setApiCounts(json.metrics);
      } catch {
        if (!cancelled) setUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    if (apiCounts) return apiCounts;
    const todayTs = dayStart(REF_TODAY);
    const weekAgoTs = todayTs - 7 * 24 * 60 * 60 * 1000;

    return {
      total: users.length,
      ativo: users.filter((u) => u.status === "ativo").length,
      pendente: users.filter((u) => u.status === "pendente").length,
      bloqueado: users.filter((u) => u.status === "bloqueado").length,
      /** Cadastros nos últimos 7 dias */
      novos: users.filter((u) => dayStart(u.createdAt) >= weekAgoTs).length,
      /** Cadastros no dia de referência */
      hoje: users.filter((u) => dayStart(u.createdAt) === todayTs).length,
    };
  }, [users, apiCounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (tab !== "todos" && u.status !== tab) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q)
      );
    });
  }, [users, tab, search]);

  async function setStatus(id: string, status: UserStatus) {
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch(
        `/api/v1/admin/users/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) return;
    } catch {
      return;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, status } : u))
    );
    setSelectedUser((cur) =>
      cur && cur.id === id ? { ...cur, status } : cur
    );
  }

  async function saveUserFees(
    id: string,
    fees: {
      mdrPercent: number;
      mdrFixed: number;
      saquePercent: number;
      saqueFixed: number;
    }
  ) {
    try {
      await fetch(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fees }),
      });
    } catch {
      /* local */
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, fees } : u))
    );
    setSelectedUser((cur) =>
      cur && cur.id === id ? { ...cur, fees } : cur
    );
  }

  async function saveUserDocs(id: string, documentsStatus: "aprovado" | "pendente" | "rejeitado") {
    try {
      await fetch(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentsStatus }),
      });
    } catch {
      /* local */
    }
  }

  async function saveUserRouting(
    id: string,
    data: {
      saqueAutomatico?: boolean;
      adquirenteIds?: string[];
      routingMode?: "plataforma" | "personalizado";
      preferredAdquirenteId?: string | null;
    }
  ) {
    const { authedFetch } = await import("@/lib/client/session");
    const res = await authedFetch(
      `/api/v1/admin/users/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error || `Falha ao salvar (${res.status})`);
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id
          ? {
              ...u,
              saqueAutomatico:
                data.saqueAutomatico !== undefined
                  ? data.saqueAutomatico
                  : u.saqueAutomatico,
              routingMode: data.routingMode ?? u.routingMode,
              preferredAdquirenteId:
                data.preferredAdquirenteId !== undefined
                  ? data.preferredAdquirenteId
                  : u.preferredAdquirenteId,
              adquirenteIds:
                data.adquirenteIds !== undefined
                  ? data.adquirenteIds
                  : u.adquirenteIds,
            }
          : u
      )
    );
    setSelectedUser((cur) =>
      cur && cur.id === id
        ? {
            ...cur,
            saqueAutomatico:
              data.saqueAutomatico !== undefined
                ? data.saqueAutomatico
                : cur.saqueAutomatico,
            routingMode: data.routingMode ?? cur.routingMode,
            preferredAdquirenteId:
              data.preferredAdquirenteId !== undefined
                ? data.preferredAdquirenteId
                : cur.preferredAdquirenteId,
            adquirenteIds:
              data.adquirenteIds !== undefined
                ? data.adquirenteIds
                : cur.adquirenteIds,
          }
        : cur
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <AdminUserDetailModal
        open={!!selectedUser}
        user={selectedUser}
        onClose={() => setSelectedUser(null)}
        onStatusChange={setStatus}
        onSaveFees={saveUserFees}
        onSaveDocs={saveUserDocs}
        onSaveRouting={saveUserRouting}
      />
      {/* Linha 1 3 indicadores */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
        }}
      >
        <AdminMetricCard
          icon={<IconUsersFilled size={ICON} />}
          label="Total de usuários"
          value={String(counts.total)}
        />
        <AdminMetricCard
          icon={<IconCheckFilled size={ICON} />}
          label="Usuários ativos"
          value={String(counts.ativo)}
        />
        <AdminMetricCard
          icon={<IconClockFilled size={ICON} />}
          label="Usuários pendentes"
          value={String(counts.pendente)}
        />
      </div>

      {/* Linha 2 3 indicadores */}
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
        }}
      >
        <AdminMetricCard
          icon={<IconLockFilled size={ICON} />}
          label="Usuários bloqueados"
          value={String(counts.bloqueado)}
        />
        <AdminMetricCard
          icon={<IconMoneyFlying size={ICON} />}
          label="Usuários hoje"
          value={String(counts.hoje)}
        />
        <AdminMetricCard
          icon={<IconTransferFilled size={28} />}
          label="Usuários novos"
          value={String(counts.novos)}
        />
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
          aria-label="Filtrar usuários"
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
                  /* Aba ativa: fundo branco + texto preto */
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
            placeholder="Buscar por nome, e-mail ou ID…"
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
        aria-label={TABS.find((t) => t.id === tab)?.label ?? "Usuários"}
      >
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Nome",
                  "E-mail",
                  "Celular",
                  "CNPJ",
                  "Data",
                  "Status",
                  "",
                ].map((h) => (
                  <th
                    key={h || "ver"}
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
              {filtered.map((u) => {
                // Cor da linha inteira conforme status
                const rowColor =
                  u.status === "ativo"
                    ? "#ffffff"
                    : u.status === "bloqueado"
                      ? "#ef4444"
                      : "#f5a623";
                const statusLabel =
                  u.status === "ativo"
                    ? "Aprovado"
                    : u.status === "bloqueado"
                      ? "Bloqueado"
                      : "Pendente";
                return (
                <tr key={u.id}>
                  <AdminTd>
                    <span
                      className="font-medium"
                      style={{ color: rowColor }}
                    >
                      {u.name}
                    </span>
                  </AdminTd>
                  <AdminTd nowrap>
                    <span
                      className="font-semibold"
                      style={{ color: rowColor, fontSize: 13 }}
                    >
                      {u.email}
                    </span>
                  </AdminTd>
                  <AdminTd nowrap>
                    <span
                      className="font-semibold tabular"
                      style={{ color: rowColor, fontSize: 13 }}
                    >
                      {u.phone}
                    </span>
                  </AdminTd>
                  <AdminTd nowrap>
                    <span
                      className="font-semibold tabular"
                      style={{ color: rowColor, fontSize: 13 }}
                    >
                      {documentLabel(u)}
                    </span>
                  </AdminTd>
                  <AdminTd nowrap>
                    <span
                      className="font-semibold tabular"
                      style={{ color: rowColor, fontSize: 13 }}
                    >
                      {formatDateTime(u.createdAt)}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <span
                      className="inline-flex items-center justify-center font-semibold"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: rowColor,
                      }}
                    >
                      {statusLabel}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <AdminActionButton
                      variant="primary"
                      onClick={() => setSelectedUser(u)}
                    >
                      Ver
                    </AdminActionButton>
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
                    Nenhum usuário nesta aba
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
