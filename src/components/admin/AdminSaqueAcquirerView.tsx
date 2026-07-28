"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBRL } from "@/lib/format";
import type { Adquirente } from "@/lib/mock/admin";
import { AdminStatusBadge } from "./AdminStatusBadge";
import { AdminTd } from "./AdminTable";

/**
 * Admin → Adquirentes → Saque
 *
 * Escolhe a adquirente WHITE de PIX out. Todos os saques da plataforma
 * (seller site, saque automático, aprovação admin) saem por ela —
 * independente da adquirente de cobrança do seller.
 */
export function AdminSaqueAcquirerView() {
  const [items, setItems] = useState<Adquirente[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch("/api/v1/admin/acquirers");
      const json = (await res.json()) as {
        items?: Adquirente[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Falha ao carregar");
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const payoutPrimary = items.find((a) => a.isPayoutPrimary) || null;

  async function setPayoutPrimary(id: string, enable: boolean) {
    setSavingId(id);
    setMsg(null);
    setErr(null);
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch(
        `/api/v1/admin/acquirers/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(
            enable
              ? { setPayoutPrimary: true }
              : { clearPayoutPrimary: true }
          ),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao salvar");
      await reload();
      setMsg(
        enable
          ? "Adquirente de saque definida. Todos os saques sairão por ela."
          : "Adquirente de saque desativada. Saques voltam à principal de cobrança."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div
        className="surface-card"
        style={{
          padding: "16px 18px",
          borderRadius: "var(--radius-card)",
        }}
      >
        <p
          className="font-semibold"
          style={{ margin: 0, fontSize: 15, color: "var(--text-1)" }}
        >
          Adquirente de saque (white)
        </p>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          Escolha a adquirente exclusiva de PIX out. Todo saque dos sellers
          (site, automático ou aprovação no painel) sai por ela — não pela
          adquirente em que o seller recebe as vendas.
        </p>
        {payoutPrimary ? (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 13,
              color: "#22c55e",
              fontWeight: 600,
            }}
          >
            Ativa agora: {payoutPrimary.name} ({payoutPrimary.code})
          </p>
        ) : (
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 13,
              color: "#fbbf24",
              fontWeight: 500,
            }}
          >
            Nenhuma white de saque definida — saques usam a principal de
            cobrança (#1 do Gerenciamento).
          </p>
        )}
      </div>

      {err ? (
        <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{err}</p>
      ) : null}
      {msg ? (
        <p style={{ margin: 0, fontSize: 13, color: "#22c55e" }}>{msg}</p>
      ) : null}

      <div
        className="surface-card overflow-hidden"
        style={{ borderRadius: "var(--radius-card)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {[
                  "Adquirente",
                  "Código",
                  "Status",
                  "Taxa",
                  "Credenciais",
                  "Saque white",
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
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center"
                    style={{ fontSize: 13, color: "var(--text-3)" }}
                  >
                    Carregando…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center"
                    style={{ fontSize: 13, color: "var(--text-3)" }}
                  >
                    Nenhuma adquirente cadastrada
                  </td>
                </tr>
              ) : (
                items.map((a) => {
                  const on = !!a.isPayoutPrimary;
                  const busy = savingId === a.id;
                  const hasKey = !!a.hasPrivateKey;
                  return (
                    <tr key={a.id}>
                      <AdminTd>
                        <span
                          className="font-semibold"
                          style={{ color: "var(--text-1)" }}
                        >
                          {a.name}
                          {a.isPrimary ? (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 11,
                                color: "var(--text-3)",
                                fontWeight: 500,
                              }}
                            >
                              · #1 cobrança
                            </span>
                          ) : null}
                        </span>
                      </AdminTd>
                      <AdminTd nowrap>
                        <span
                          className="tabular"
                          style={{ fontSize: 13, color: "var(--text-2)" }}
                        >
                          {a.code}
                        </span>
                      </AdminTd>
                      <AdminTd>
                        <AdminStatusBadge
                          tone={
                            a.status === "ativo"
                              ? "success"
                              : a.status === "manutencao"
                                ? "warning"
                                : "danger"
                          }
                          label={
                            a.status === "ativo"
                              ? "Ativo"
                              : a.status === "manutencao"
                                ? "Manutenção"
                                : "Inativo"
                          }
                        />
                      </AdminTd>
                      <AdminTd nowrap>
                        <span
                          className="tabular"
                          style={{ fontSize: 13, color: "var(--text-2)" }}
                        >
                          {a.feePercent > 0
                            ? `${a.feePercent}%`
                            : ""}
                          {a.feePercent > 0 && a.feeFixed > 0 ? " + " : ""}
                          {a.feeFixed > 0 ? formatBRL(a.feeFixed) : ""}
                          {a.feePercent <= 0 && a.feeFixed <= 0 ? "—" : ""}
                        </span>
                      </AdminTd>
                      <AdminTd>
                        <span
                          style={{
                            fontSize: 12.5,
                            color: hasKey ? "#22c55e" : "#fbbf24",
                            fontWeight: 600,
                          }}
                        >
                          {hasKey ? "OK" : "Sem chave"}
                        </span>
                      </AdminTd>
                      <AdminTd>
                        <button
                          type="button"
                          disabled={busy || (!hasKey && !on)}
                          onClick={() => void setPayoutPrimary(a.id, !on)}
                          title={
                            !hasKey && !on
                              ? "Salve as credenciais antes de ativar"
                              : on
                                ? "Desativar como white de saque"
                                : "Ativar como white de saque"
                          }
                          className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
                          style={{
                            height: 34,
                            minWidth: 110,
                            padding: "0 14px",
                            borderRadius: "var(--radius-md)",
                            border: on
                              ? "none"
                              : "1px solid var(--border-muted)",
                            background: on ? "#22c55e" : "var(--bg-elevated)",
                            color: on ? "#0a0f0c" : "var(--text-1)",
                            fontSize: 12.5,
                            cursor:
                              busy || (!hasKey && !on)
                                ? "not-allowed"
                                : "pointer",
                            opacity: busy || (!hasKey && !on) ? 0.5 : 1,
                          }}
                        >
                          {busy
                            ? "Salvando…"
                            : on
                              ? "Ativa no saque"
                              : "Usar no saque"}
                        </button>
                      </AdminTd>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
