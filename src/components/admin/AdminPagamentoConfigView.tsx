"use client";

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  clearAcquirerCredential,
  hasCredentials,
  listAcquirerCredentials,
  maskKey,
  upsertAcquirerCredential,
  type AcquirerCredential,
  type AcquirerEnv,
} from "@/lib/payment-credentials";
import { authedFetch } from "@/lib/client/session";

/** Mesmo shell de campo dos modais admin */
const fieldShell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 14px",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-card)",
  minHeight: 58,
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-3)",
  fontWeight: 500,
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-1)",
  fontSize: 14,
  fontWeight: 500,
  padding: 0,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const btnBase: CSSProperties = {
  height: 38,
  padding: "0 18px",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

/** Botão olho — estilo anterior (transparente, centralizado no campo) */
const eyeBtnStyle: CSSProperties = {
  width: 36,
  height: 36,
  border: "none",
  background: "transparent",
  color: "var(--text-2)",
  cursor: "pointer",
  padding: 0,
  borderRadius: 8,
  lineHeight: 0,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

type ApiAcquirer = {
  id: string;
  name: string;
  code: string;
  publicKey?: string | null;
  privateKey?: string | null;
  env?: string | null;
  enabled?: boolean;
  status?: string;
};

function toCredential(a: ApiAcquirer): AcquirerCredential {
  const privateKey = (a.privateKey ?? "").trim();
  const publicKey = (a.publicKey ?? "").trim();
  const env: AcquirerEnv =
    a.env === "live" || (!privateKey.includes("test") && a.env === "live")
      ? "live"
      : privateKey.includes("test") || a.env === "sandbox"
        ? "sandbox"
        : a.env === "live"
          ? "live"
          : "sandbox";
  return {
    id: a.id,
    code: a.code || a.id.toUpperCase(),
    name: a.name || a.id,
    publicKey,
    privateKey,
    env,
    enabled: a.enabled ?? a.status === "ativo",
    updatedAt: privateKey || publicKey ? new Date().toISOString() : undefined,
  };
}

/**
 * Admin → Adquirentes → Credenciais
 * Persistência real no banco (PATCH /api/v1/admin/acquirers/:id).
 * localStorage é só cache de UI.
 */
export function AdminPagamentoConfigView() {
  const [items, setItems] = useState<AcquirerCredential[]>([]);
  const [drafts, setDrafts] = useState<
    Record<string, { publicKey: string; privateKey: string }>
  >({});
  const [showPrivate, setShowPrivate] = useState<Record<string, boolean>>({});
  const [showPublic, setShowPublic] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"database" | "local" | "mock">("local");

  const applyList = useCallback((list: AcquirerCredential[]) => {
    setItems(list);
    const nextDrafts: Record<string, { publicKey: string; privateKey: string }> =
      {};
    for (const c of list) {
      nextDrafts[c.id] = {
        publicKey: c.publicKey,
        privateKey: c.privateKey,
      };
    }
    setDrafts(nextDrafts);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/v1/admin/acquirers");
      if (res.status === 401 || res.status === 403) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          j.error ||
            "Não autenticado como admin. Faça login com conta admin e tente de novo."
        );
        // ainda mostra catálogo local
        applyList(listAcquirerCredentials());
        setSource("local");
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `Falha ao carregar adquirentes (${res.status})`);
      }
      const json = (await res.json()) as {
        source?: string;
        items?: ApiAcquirer[];
      };
      if (json.items?.length) {
        const list = json.items.map(toCredential).sort((a, b) => {
          if (a.id === "podpay" || a.code === "PODPAY") return -1;
          if (b.id === "podpay" || b.code === "PODPAY") return 1;
          return a.name.localeCompare(b.name, "pt-BR");
        });
        applyList(list);
        // espelha no localStorage (cache + sync PodPay client hub)
        for (const c of list) {
          upsertAcquirerCredential(c);
        }
        setSource(
          json.source === "mysql" || json.source === "database"
            ? "database"
            : "mock"
        );
        return;
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao carregar credenciais do servidor"
      );
    } finally {
      setLoading(false);
    }
    applyList(listAcquirerCredentials());
    setSource("local");
  }, [applyList]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function updateDraft(
    id: string,
    patch: Partial<{ publicKey: string; privateKey: string }>
  ) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function handleSave(id: string, e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setFlash(null);
    const draft = drafts[id];
    const base = items.find((x) => x.id === id);
    if (!draft || !base) return;

    const publicKey = draft.publicKey.trim();
    const privateKey = draft.privateKey.trim();
    const isPodPay = base.id === "podpay" || base.code === "PODPAY";

    if (isPodPay && privateKey && !privateKey.startsWith("sk_")) {
      setError(
        "PodPay: a chave privada deve começar com sk_test_… ou sk_live_…"
      );
      return;
    }
    if (!publicKey && !privateKey) {
      setError("Informe ao menos a chave privada (sk_…).");
      return;
    }

    const env: AcquirerEnv =
      privateKey.includes("test") || publicKey.includes("test")
        ? "sandbox"
        : "live";

    setSavingId(id);
    try {
      const res = await authedFetch(
        `/api/v1/admin/acquirers/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ publicKey, privateKey, env }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved?: boolean;
        source?: string;
        hasPrivateKey?: boolean;
      };

      if (!res.ok) {
        throw new Error(
          json.error ||
            (res.status === 401
              ? "Não autenticado. Entre de novo como admin."
              : `Falha ao salvar no banco (${res.status})`)
        );
      }

      // Cache local + espelho PodPay no browser (hub integrações)
      upsertAcquirerCredential({
        id,
        code: base.code,
        name: base.name,
        publicKey,
        privateKey,
        env,
        enabled: base.enabled,
      });

      setFlash(
        isPodPay
          ? "PodPay: chave privada salva no banco. PIX real disponível em Integrações → Pagamentos."
          : `${base.name}: credenciais salvas no banco.`
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSavingId(null);
    }
  }

  async function handleClear(id: string) {
    const base = items.find((x) => x.id === id);
    if (!base) return;
    if (
      !window.confirm(
        `Remover as chaves de ${base.name}? A adquirente ficará sem credenciais no banco.`
      )
    ) {
      return;
    }
    setError(null);
    setFlash(null);
    setSavingId(id);
    try {
      const res = await authedFetch(
        `/api/v1/admin/acquirers/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ clearCredentials: true }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || `Falha ao limpar (${res.status})`);
      }
      clearAcquirerCredential(id);
      setFlash(`${base.name}: chaves removidas do banco.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <p
        style={{
          margin: 0,
          fontSize: 13.5,
          color: "var(--text-2)",
          lineHeight: 1.5,
        }}
      >
        Cadastre as chaves de cada adquirente. A PodPay é a principal do
        gateway — salve a <strong style={{ color: "var(--text-1)" }}>chave privada</strong>{" "}
        <code style={{ fontSize: 12 }}>sk_test_…</code> ou{" "}
        <code style={{ fontSize: 12 }}>sk_live_…</code>. Status e rota ficam em{" "}
        <strong style={{ color: "var(--text-1)", fontWeight: 600 }}>
          Gerenciamento
        </strong>
        .
        {source === "database" ? (
          <span style={{ color: "var(--text-3)" }}> · sincronizado com o banco</span>
        ) : source === "mock" ? (
          <span style={{ color: "#fbbf24" }}> · banco offline (lista mock)</span>
        ) : null}
      </p>

      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)" }}>
          Carregando credenciais…
        </p>
      ) : null}

      {error ? (
        <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{error}</p>
      ) : null}
      {flash ? (
        <p style={{ margin: 0, fontSize: 13, color: "#4ade80" }}>{flash}</p>
      ) : null}

      <div className="flex flex-col" style={{ gap: 14 }}>
        {items.map((acq) => {
          const draft = drafts[acq.id] ?? {
            publicKey: "",
            privateKey: "",
          };
          const configured = hasCredentials({
            ...acq,
            publicKey: draft.publicKey,
            privateKey: draft.privateKey,
          });
          const isPodPay = acq.id === "podpay" || acq.code === "PODPAY";

          return (
            <form
              key={acq.id}
              onSubmit={(e) => handleSave(acq.id, e)}
              className="surface-card flex flex-col"
              style={{
                padding: 0,
                borderRadius: "var(--radius-card)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "18px 20px 0" }}>
                <h2
                  className="font-bold"
                  style={{
                    margin: 0,
                    fontSize: 16,
                    color: "var(--text-1)",
                    lineHeight: 1.25,
                  }}
                >
                  {acq.name}
                </h2>
                <p
                  className="tabular"
                  style={{
                    fontSize: 12,
                    color: "var(--text-3)",
                    margin: "6px 0 0",
                  }}
                >
                  {acq.code}
                  {isPodPay ? " · Principal" : ""}
                  {configured
                    ? acq.updatedAt
                      ? ` · atualizada ${new Date(acq.updatedAt).toLocaleString("pt-BR")}`
                      : " · com chaves"
                    : " · sem chaves"}
                </p>
              </div>

              <div
                className="flex flex-col"
                style={{ padding: "16px 20px 8px", gap: 12 }}
              >
                <div
                  style={{
                    ...fieldShell,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    className="flex flex-col min-w-0"
                    style={{ flex: 1, gap: 4 }}
                  >
                    <span style={labelStyle}>Chave pública</span>
                    <input
                      type={showPublic[acq.id] ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Cole a chave pública (opcional)"
                      value={draft.publicKey}
                      onChange={(e) =>
                        updateDraft(acq.id, { publicKey: e.target.value })
                      }
                      style={inputStyle}
                    />
                    {acq.publicKey ? (
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                        Salva: {maskKey(acq.publicKey)}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label={
                      showPublic[acq.id]
                        ? "Ocultar chave pública"
                        : "Mostrar chave pública"
                    }
                    onClick={() =>
                      setShowPublic((s) => ({
                        ...s,
                        [acq.id]: !s[acq.id],
                      }))
                    }
                    style={eyeBtnStyle}
                  >
                    {showPublic[acq.id] ? (
                      <EyeOff size={20} strokeWidth={1.75} />
                    ) : (
                      <Eye size={20} strokeWidth={1.75} />
                    )}
                  </button>
                </div>

                <div
                  style={{
                    ...fieldShell,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    className="flex flex-col min-w-0"
                    style={{ flex: 1, gap: 4 }}
                  >
                    <span style={labelStyle}>
                      Chave privada{isPodPay ? " (obrigatória p/ PIX)" : ""}
                    </span>
                    <input
                      type={showPrivate[acq.id] ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={
                        isPodPay
                          ? "sk_test_… ou sk_live_…"
                          : "Cole a chave privada"
                      }
                      value={draft.privateKey}
                      onChange={(e) =>
                        updateDraft(acq.id, { privateKey: e.target.value })
                      }
                      style={inputStyle}
                    />
                    {acq.privateKey ? (
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                        Salva: {maskKey(acq.privateKey)}
                      </span>
                    ) : isPodPay ? (
                      <span style={{ fontSize: 11, color: "#fbbf24" }}>
                        Sem chave no banco — pagamentos PIX falharão
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label={
                      showPrivate[acq.id]
                        ? "Ocultar chave privada"
                        : "Mostrar chave privada"
                    }
                    onClick={() =>
                      setShowPrivate((s) => ({
                        ...s,
                        [acq.id]: !s[acq.id],
                      }))
                    }
                    style={eyeBtnStyle}
                  >
                    {showPrivate[acq.id] ? (
                      <EyeOff size={20} strokeWidth={1.75} />
                    ) : (
                      <Eye size={20} strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>

              <div
                className="flex flex-wrap items-center justify-end gap-2.5"
                style={{ padding: "12px 20px 18px" }}
              >
                {hasCredentials(acq) ? (
                  <button
                    type="button"
                    onClick={() => handleClear(acq.id)}
                    disabled={savingId === acq.id}
                    className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
                    style={{
                      ...btnBase,
                      border: "1px solid var(--border-muted)",
                      background: "var(--bg-elevated)",
                      color: "var(--text-1)",
                    }}
                  >
                    Limpar chaves
                  </button>
                ) : null}

                <button
                  type="submit"
                  disabled={savingId === acq.id}
                  className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
                  style={{
                    ...btnBase,
                    border: "none",
                    background: "#ffffff",
                    color: "#0a0f0c",
                    opacity: savingId === acq.id ? 0.7 : 1,
                    cursor: savingId === acq.id ? "wait" : "pointer",
                  }}
                >
                  {savingId === acq.id ? "Salvando…" : "Salvar no banco"}
                </button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}
