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
  upsertAcquirerCredential,
  type AcquirerCredential,
  type AcquirerEnv,
} from "@/lib/payment-credentials";
import { authedFetch } from "@/lib/client/session";

const fieldShell: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
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
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
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
  hasPublicKey?: boolean;
  hasPrivateKey?: boolean;
  publicKeyHint?: string | null;
  privateKeyHint?: string | null;
  env?: string | null;
  enabled?: boolean;
  status?: string;
  isPrimary?: boolean;
};

type Draft = {
  publicKey: string;
  privateKey: string;
  /** chaves já reveladas nesta sessão (eye) */
  revealed?: boolean;
};

function toCredential(a: ApiAcquirer): AcquirerCredential & {
  isPrimary?: boolean;
  hasPublicKey?: boolean;
  hasPrivateKey?: boolean;
  publicKeyHint?: string | null;
  privateKeyHint?: string | null;
} {
  // Listagem NÃO traz secret completa — só hints
  const env: AcquirerEnv = a.env === "sandbox" ? "sandbox" : "live";
  return {
    id: a.id,
    code: a.code || a.id.toUpperCase(),
    name: a.name || a.id,
    publicKey: "",
    privateKey: "",
    env,
    enabled: a.enabled ?? a.status === "ativo",
    updatedAt: a.hasPrivateKey || a.hasPublicKey ? new Date().toISOString() : undefined,
    isPrimary: !!a.isPrimary,
    hasPublicKey: !!a.hasPublicKey,
    hasPrivateKey: !!a.hasPrivateKey,
    publicKeyHint: a.publicKeyHint,
    privateKeyHint: a.privateKeyHint,
  };
}

/**
 * Admin → Adquirentes → Credenciais
 * UI limpa: só nome da adquirente + inputs de chaves + olho para revelar.
 */
export function AdminPagamentoConfigView() {
  const [items, setItems] = useState<
    (AcquirerCredential & { isPrimary?: boolean })[]
  >([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [showPrivate, setShowPrivate] = useState<Record<string, boolean>>({});
  const [showPublic, setShowPublic] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applyList = useCallback(
    (
      list: (AcquirerCredential & {
        isPrimary?: boolean;
        hasPublicKey?: boolean;
        hasPrivateKey?: boolean;
        publicKeyHint?: string | null;
        privateKeyHint?: string | null;
      })[]
    ) => {
      setItems(list);
      // Inputs vazios por padrão (secret não vem na listagem).
      // Usuário cola nova chave ou clica no olho para revelar sob demanda.
      setDrafts((prev) => {
        const next: Record<string, Draft> = {};
        for (const c of list) {
          // mantém valor digitado/revelado se ainda for a mesma sessão
          next[c.id] = prev[c.id]?.revealed
            ? prev[c.id]
            : { publicKey: "", privateKey: "", revealed: false };
        }
        return next;
      });
    },
    []
  );

  /** Revela chaves completas via GET ?reveal=1 (admin) */
  async function revealSecrets(id: string) {
    try {
      const res = await authedFetch(
        `/api/v1/admin/acquirers/${encodeURIComponent(id)}?reveal=1`
      );
      if (!res.ok) return;
      const json = (await res.json()) as {
        publicKey?: string;
        privateKey?: string;
      };
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          publicKey: json.publicKey || "",
          privateKey: json.privateKey || "",
          revealed: true,
        },
      }));
    } catch {
      /* ignore */
    }
  }

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/v1/admin/acquirers");
      if (res.status === 401 || res.status === 403) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || "Não autenticado como admin.");
        applyList(listAcquirerCredentials());
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          j.error || `Falha ao carregar adquirentes (${res.status})`
        );
      }
      const json = (await res.json()) as { items?: ApiAcquirer[] };
      if (json.items?.length) {
        const list = json.items.map(toCredential).sort((a, b) => {
          if (a.id === "velana" || a.code === "VELANA") return -1;
          if (b.id === "velana" || b.code === "VELANA") return 1;
          if (a.id === "podpay" || a.code === "PODPAY") return -1;
          if (b.id === "podpay" || b.code === "PODPAY") return 1;
          return a.name.localeCompare(b.name, "pt-BR");
        });
        if (!list.some((x) => x.id === "velana" || x.code === "VELANA")) {
          list.unshift({
            id: "velana",
            code: "VELANA",
            name: "Velana",
            publicKey: "",
            privateKey: "",
            env: "live",
            enabled: true,
          });
        }
        applyList(list);
        for (const c of list) {
          if (c.privateKey || c.publicKey) upsertAcquirerCredential(c);
        }
        return;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar credenciais"
      );
    } finally {
      setLoading(false);
    }
    applyList(listAcquirerCredentials());
  }, [applyList]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => {
      const base: Draft = prev[id] ?? { publicKey: "", privateKey: "" };
      return { ...prev, [id]: { ...base, ...patch } };
    });
  }

  async function handleSave(id: string, e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setFlash(null);
    const draft = drafts[id] ?? { publicKey: "", privateKey: "" };
    const base = items.find((x) => x.id === id);
    if (!base) return;

    const publicKey = draft.publicKey.trim();
    const privateKey = draft.privateKey.trim();
    const isPodPay = base.id === "podpay" || base.code === "PODPAY";
    const isVelana = base.id === "velana" || base.code === "VELANA";

    if (isPodPay && privateKey && !privateKey.startsWith("sk_")) {
      setError("PodPay: a chave privada deve começar com sk_test_… ou sk_live_…");
      return;
    }
    if (isVelana && !privateKey) {
      setError("Velana: informe a chave secreta (sk_…).");
      return;
    }
    if (!publicKey && !privateKey) {
      setError("Informe ao menos uma chave.");
      return;
    }

    const env: AcquirerEnv =
      privateKey.toLowerCase().includes("test") ||
      publicKey.toLowerCase().includes("test")
        ? "sandbox"
        : "live";

    setSavingId(id);
    try {
      const res = await authedFetch(
        `/api/v1/admin/acquirers/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            publicKey,
            privateKey,
            env,
            setPrimary: isVelana ? true : undefined,
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved?: boolean;
        source?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || `Falha ao salvar (${res.status})`);
      }
      if (!json.saved && json.source !== "database") {
        throw new Error("Não foi possível salvar no banco.");
      }

      upsertAcquirerCredential({
        id,
        code: base.code,
        name: base.name,
        publicKey,
        privateKey,
        env,
        enabled: true,
      });

      setFlash("Salvo.");
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
    if (!window.confirm(`Remover as chaves de ${base.name}?`)) return;
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
      if (!res.ok) throw new Error(json.error || `Falha ao limpar (${res.status})`);
      clearAcquirerCredential(id);
      setFlash("Chaves removidas.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao limpar");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)" }}>
          Carregando…
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
            revealed: false,
          };
          const meta = acq as AcquirerCredential & {
            hasPrivateKey?: boolean;
            hasPublicKey?: boolean;
            privateKeyHint?: string | null;
            publicKeyHint?: string | null;
          };
          const configured =
            hasCredentials(acq) ||
            !!meta.hasPrivateKey ||
            !!meta.hasPublicKey ||
            !!(draft.publicKey.trim() || draft.privateKey.trim());

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
                <div
                  className="inline-flex items-center flex-wrap"
                  style={{ gap: 10 }}
                >
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
                  {acq.isPrimary ? (
                    <span
                      className="inline-flex items-center justify-center font-semibold shrink-0"
                      style={{
                        height: 24,
                        padding: "0 9px",
                        borderRadius: 8,
                        background: "#ffffff",
                        color: "#0a0f0c",
                        fontSize: 11,
                        lineHeight: 1,
                        letterSpacing: "0.01em",
                        whiteSpace: "nowrap",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                      }}
                    >
                      Principal
                    </span>
                  ) : null}
                </div>
              </div>

              <div
                className="flex flex-col"
                style={{ padding: "16px 20px 8px", gap: 12 }}
              >
                {/* Chave pública */}
                <div style={fieldShell}>
                  <div
                    className="flex flex-col min-w-0"
                    style={{ flex: 1, gap: 4 }}
                  >
                    <span style={labelStyle}>Chave pública</span>
                    <input
                      type={showPublic[acq.id] ? "text" : "password"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={
                        meta.hasPublicKey && !draft.publicKey
                          ? `Salva ${meta.publicKeyHint || "••••"} — clique no olho`
                          : "Chave pública"
                      }
                      value={draft.publicKey}
                      onChange={(e) =>
                        updateDraft(acq.id, { publicKey: e.target.value })
                      }
                      style={inputStyle}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={
                      showPublic[acq.id]
                        ? "Ocultar chave pública"
                        : "Mostrar chave pública"
                    }
                    onClick={() => {
                      const next = !showPublic[acq.id];
                      setShowPublic((s) => ({ ...s, [acq.id]: next }));
                      if (next && !draft.publicKey && meta.hasPublicKey) {
                        void revealSecrets(acq.id);
                      }
                    }}
                    style={eyeBtnStyle}
                  >
                    {showPublic[acq.id] ? (
                      <EyeOff size={20} strokeWidth={1.75} />
                    ) : (
                      <Eye size={20} strokeWidth={1.75} />
                    )}
                  </button>
                </div>

                {/* Chave privada / secret */}
                <div style={fieldShell}>
                  <div
                    className="flex flex-col min-w-0"
                    style={{ flex: 1, gap: 4 }}
                  >
                    <span style={labelStyle}>Chave secreta</span>
                    <input
                      type={showPrivate[acq.id] ? "text" : "password"}
                      autoComplete="new-password"
                      spellCheck={false}
                      placeholder={
                        meta.hasPrivateKey && !draft.privateKey
                          ? `Salva ${meta.privateKeyHint || "••••"} — clique no olho`
                          : "Chave secreta"
                      }
                      value={draft.privateKey}
                      onChange={(e) =>
                        updateDraft(acq.id, { privateKey: e.target.value })
                      }
                      style={inputStyle}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={
                      showPrivate[acq.id]
                        ? "Ocultar chave secreta"
                        : "Mostrar chave secreta"
                    }
                    onClick={() => {
                      const next = !showPrivate[acq.id];
                      setShowPrivate((s) => ({ ...s, [acq.id]: next }));
                      if (next && !draft.privateKey && meta.hasPrivateKey) {
                        void revealSecrets(acq.id);
                      }
                    }}
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
                {configured ? (
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
                    Limpar
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
                  {savingId === acq.id ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}
