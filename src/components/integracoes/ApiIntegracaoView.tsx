"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  X,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";

/** Ações da credencial mesmo tamanho (um pouco maior) */
const ACTION_ICON = 18;
const ACTION_BTN = 36;
/** Filtro PNG preto → vermelho #ef4444 */
const FILTER_ICON_RED =
  "brightness(0) saturate(100%) invert(36%) sepia(86%) saturate(2476%) hue-rotate(338deg) brightness(98%) contrast(96%)";
/** Filtro PNG preto → branco */
const FILTER_ICON_WHITE = "brightness(0) saturate(100%) invert(1)";

const STORAGE_IPS = "darkpay.api.authorized_ips.v1";
/** Secrets revelados só nesta sessão (create/rotate) nunca persistidos */
const SESSION_SECRETS = "darkpay.api.session_secrets.v1";

export type ApiPermission =
  | "transacoes"
  | "saques"
  | "checkouts"
  | "conta";

const PERMISSION_OPTIONS: { id: ApiPermission; label: string }[] = [
  { id: "transacoes", label: "Criar/Consultar Transações" },
  { id: "saques", label: "Criar/Consultar Saques" },
  { id: "checkouts", label: "Criar Checkouts" },
  { id: "conta", label: "Consultar dados da conta/ver saldo" },
];

export interface ApiCredential {
  id: string;
  name: string;
  publicKey: string;
  /** preenchida só no create/rotate desta sessão */
  secretKey: string | null;
  secretKeyHint?: string | null;
  createdAt: string;
  expiresAt: string | null;
  permissions: ApiPermission[];
  requireManualSaqueApproval: boolean;
  env?: "live" | "test";
  active?: boolean;
}

export interface AuthorizedIp {
  id: string;
  ip: string;
  authorizedAt: string;
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadSessionSecrets(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(SESSION_SECRETS);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveSessionSecret(id: string, secret: string) {
  if (typeof window === "undefined") return;
  const map = loadSessionSecrets();
  map[id] = secret;
  window.sessionStorage.setItem(SESSION_SECRETS, JSON.stringify(map));
}

function clearSessionSecret(id: string) {
  if (typeof window === "undefined") return;
  const map = loadSessionSecrets();
  delete map[id];
  window.sessionStorage.setItem(SESSION_SECRETS, JSON.stringify(map));
}

/**
 * Resolve a secret real para o painel.
 * IMPORTANTE: nunca reconstruir sk_live_ + hint (gerava chave falsa curta).
 */
function resolveSecretFull(c: ApiCredential): string | null {
  if (
    c.secretKey &&
    c.secretKey.startsWith("sk_") &&
    !c.secretKey.includes("…") &&
    !c.secretKey.includes("•") &&
    c.secretKey.length >= 20
  ) {
    return c.secretKey;
  }
  return null;
}

function maskSecretForDisplay(full: string | null, hint?: string | null): string {
  if (full && full.length > 12) {
    return `${full.slice(0, 10)}${"•".repeat(12)}${full.slice(-4)}`;
  }
  if (hint) {
    return `sk_••••••••${hint.replace(/^•+…?/, "…")}`;
  }
  return "sk_••••••••••••";
}

function isCredentialExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}



/** Botões primários mesmo raio das outras páginas (ex.: Novo gerente) */
const btnPrimary: CSSProperties = {
  height: 42,
  padding: "0 16px",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "#ffffff",
  color: "#0a0f0c",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost: CSSProperties = {
  height: 42,
  padding: "0 16px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-muted)",
  background: "var(--bg-elevated)",
  color: "var(--text-1)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

/** Vermelho sólido (padrão da plataforma) */
const btnDanger: CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "#ef4444",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 14px",
  borderRadius: "var(--radius-card)",
  border: "1px solid var(--border-card)",
  background: "var(--bg-elevated)",
  color: "var(--text-1)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

/** Overlay + sombra mesmo padrão dos modais do admin */
const overlayBackdrop: CSSProperties = {
  background: "rgba(0, 0, 0, 0.62)",
};

const modalSurface: CSSProperties = {
  maxWidth: 460,
  borderRadius: "var(--radius-md)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
  overflow: "hidden",
  zIndex: 1,
};

/** Cards/painéis radius-card; botões/chips radius-md (igual Nova credencial) */
const radiusSoft = "var(--radius-card)" as const;
const radiusBtn = "var(--radius-md)" as const;

async function copyTextToClipboard(text: string): Promise<boolean> {
  const v = (text || "").trim();
  if (!v) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(v);
      return true;
    }
  } catch {
    /* fallback abaixo */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = v;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await copyTextToClipboard(value);
        if (!ok) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
      aria-label="Copiar"
      title={value ? "Copiar" : "Nada para copiar"}
      disabled={!value?.trim()}
      className="flex items-center justify-center shrink-0 transition-opacity hover:opacity-90"
      style={{
        width: 36,
        height: 36,
        borderRadius: radiusBtn,
        border: "none",
        /* fundo branco + ícone escuro (padrão da plataforma) */
        background: "#ffffff",
        color: "#0a0f0c",
        cursor: value?.trim() ? "pointer" : "not-allowed",
        opacity: !value?.trim() ? 0.45 : copied ? 0.85 : 1,
      }}
    >
      {copied ? (
        <Check size={15} strokeWidth={2.5} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/icons/copiar.png"
          alt=""
          width={16}
          height={16}
          aria-hidden
          style={{
            width: 16,
            height: 16,
            objectFit: "contain",
            /* ícone preto no botão branco */
            filter: "brightness(0)",
            display: "block",
          }}
        />
      )}
    </button>
  );
}

function IconActionButton({
  onClick,
  ariaLabel,
  disabled,
  children,
}: {
  onClick?: () => void;
  ariaLabel: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex items-center justify-center shrink-0 transition-opacity hover:opacity-90"
      style={{
        width: 36,
        height: 36,
        borderRadius: radiusBtn,
        border: "none",
        background: "#ffffff",
        color: "#0a0f0c",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}

function SecretRow({
  label,
  value,
  canCopy = true,
  /** Secret completa — copiar sempre usa este valor (mesmo com máscara na tela) */
  fullSecret = null,
  secretMode = false,
  onReveal,
}: {
  label: string;
  value: string;
  canCopy?: boolean;
  fullSecret?: string | null;
  /** true = linha de Client Secret (olho + copiar a secret inteira) */
  secretMode?: boolean;
  /** Busca secret no servidor (reveal) ao abrir o olho */
  onReveal?: () => Promise<string | null>;
}) {
  const [visible, setVisible] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const effectiveFull = revealed || fullSecret;
  const hasFull = Boolean(
    effectiveFull &&
      effectiveFull.startsWith("sk_") &&
      effectiveFull.length >= 20 &&
      !effectiveFull.includes("…") &&
      !effectiveFull.includes("•")
  );
  // Na tela: mascarado por padrão; com olho abre a completa
  const display =
    secretMode && hasFull
      ? visible
        ? effectiveFull!
        : maskSecretForDisplay(effectiveFull, null)
      : value;
  // Copiar SEMPRE a secret completa sk_… (nunca a máscara)
  const copyValue = secretMode ? (hasFull ? effectiveFull! : "") : value;

  async function toggleVisible() {
    if (!secretMode) {
      setVisible((v) => !v);
      return;
    }
    if (visible) {
      setVisible(false);
      return;
    }
    if (!hasFull && onReveal) {
      setRevealing(true);
      try {
        const s = await onReveal();
        if (s) setRevealed(s);
      } finally {
        setRevealing(false);
      }
    }
    setVisible(true);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span
        style={{
          fontSize: 13,
          color: "var(--text-2)",
          fontWeight: 650,
        }}
      >
        {label}
      </span>
      <div
        className="flex items-center gap-2"
        style={{
          padding: "12px 14px",
          borderRadius: radiusSoft,
          background: "var(--bg-card)",
          border: "1px solid var(--border-card)",
        }}
      >
        <code
          className="min-w-0 flex-1 tabular"
          style={{
            fontSize: 13,
            color: "var(--text-1)",
            wordBreak: "break-all",
            lineHeight: 1.4,
            letterSpacing:
              secretMode && !visible && hasFull ? "0.02em" : undefined,
          }}
        >
          {display}
        </code>
        {/* Olho: mostrar/ocultar secret (reveal no servidor se necessário) */}
        {secretMode && (hasFull || onReveal) ? (
          <IconActionButton
            ariaLabel={visible ? "Ocultar secret" : "Visualizar secret"}
            onClick={() => void toggleVisible()}
            disabled={revealing}
          >
            {revealing ? (
              <Loader2 size={16} strokeWidth={2.2} className="animate-spin" />
            ) : visible ? (
              <EyeOff size={16} strokeWidth={2.2} />
            ) : (
              <Eye size={16} strokeWidth={2.2} />
            )}
          </IconActionButton>
        ) : null}
        {/* Botão branco de copiar — SEMPRE na secret (criar/gerar/reset) e na pública */}
        {secretMode || canCopy ? <CopyButton value={copyValue} /> : null}
      </div>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  footer,
  maxWidth = 440,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  maxWidth?: number;
}) {
  const titleId = useId();
  useEffect(() => {
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
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 border-0"
        style={overlayBackdrop}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full surface-card flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          ...modalSurface,
          maxWidth,
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
            {title}
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
        <div style={{ padding: "16px 18px 8px" }}>{children}</div>
        <div
          className="flex justify-end gap-2.5 shrink-0"
          style={{ padding: "8px 18px 18px" }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}

export function ApiIntegracaoView() {
  const [creds, setCreds] = useState<ApiCredential[]>([]);
  const [ips, setIps] = useState<AuthorizedIp[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [ipOpen, setIpOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  /** Id da credencial em rotação ícone só gira enquanto true */
  const [rotatingId, setRotatingId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formPerms, setFormPerms] = useState<ApiPermission[]>([]);
  const [formExpires, setFormExpires] = useState("");
  const [formManualSaque, setFormManualSaque] = useState(false);
  const [formIp, setFormIp] = useState("");

  const mergeSecrets = useCallback((list: ApiCredential[]): ApiCredential[] => {
    const secrets = loadSessionSecrets();
    return list.map((c) => ({
      ...c,
      secretKey: c.secretKey || secrets[c.id] || null,
    }));
  }, []);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch("/api/v1/api-credentials");
      const json = (await res.json()) as {
        items?: ApiCredential[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || `Falha ao carregar (${res.status})`);
      }
      const list = mergeSecrets(json.items ?? []);
      setCreds(list);
      setExpandedId((prev) => prev ?? list[0]?.id ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar credenciais"
      );
    } finally {
      setHydrated(true);
    }
  }, [mergeSecrets]);

  useEffect(() => {
    const i = loadJson<AuthorizedIp[]>(STORAGE_IPS, []);
    setIps(i);
    void reload();
  }, [reload]);

  const persistIps = useCallback((next: AuthorizedIp[]) => {
    setIps(next);
    localStorage.setItem(STORAGE_IPS, JSON.stringify(next));
  }, []);

  function openCreate() {
    setEditId(null);
    setFormName("");
    setFormPerms(["transacoes"]);
    setFormExpires("");
    setFormManualSaque(false);
    setCreateOpen(true);
  }

  function openEdit(c: ApiCredential) {
    setEditId(c.id);
    setFormName(c.name);
    setFormPerms([...c.permissions]);
    setFormExpires(c.expiresAt ? c.expiresAt.slice(0, 10) : "");
    setFormManualSaque(c.requireManualSaqueApproval);
    setCreateOpen(true);
  }

  function togglePerm(id: ApiPermission) {
    setFormPerms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSaveCredential(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFlash(null);
    setSaving(true);
    const expiresAt = formExpires
      ? new Date(formExpires + "T23:59:59").toISOString()
      : null;

    try {
      const { authedFetch } = await import("@/lib/client/session");
      if (editId) {
        const res = await authedFetch(
          `/api/v1/api-credentials/${encodeURIComponent(editId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: formName.trim() || "API Integração",
              permissions: formPerms,
              expiresAt,
              requireManualSaqueApproval: formManualSaque,
            }),
          }
        );
        const json = (await res.json()) as ApiCredential & { error?: string };
        if (!res.ok) throw new Error(json.error || "Falha ao salvar");
        setFlash("Credencial atualizada.");
      } else {
        const res = await authedFetch("/api/v1/api-credentials", {
          method: "POST",
          body: JSON.stringify({
            name: formName.trim() || "API Integração",
            permissions: formPerms.length ? formPerms : ["transacoes"],
            expiresAt,
            requireManualSaqueApproval: formManualSaque,
            // Credenciais reais da conta (sempre live / funcionais)
            env: "live",
          }),
        });
        const json = (await res.json()) as ApiCredential & {
          error?: string;
          warning?: string;
        };
        if (!res.ok) throw new Error(json.error || "Falha ao criar");
        if (json.secretKey) saveSessionSecret(json.id, json.secretKey);
        // Já entra na lista com secret + botão copiar
        setCreds((prev) =>
          mergeSecrets([{ ...json, secretKey: json.secretKey || null }, ...prev.filter((c) => c.id !== json.id)])
        );
        setExpandedId(json.id);
        setFlash(json.warning || "Credencial criada.");
      }
      setCreateOpen(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function rotateKeys(id: string) {
    if (rotatingId) return;
    if (
      !confirm(
        "Gerar novas chaves para esta credencial? As chaves atuais deixarão de funcionar no cassino/checkout."
      )
    )
      return;
    setRotatingId(id);
    setError(null);
    setFlash(null);
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch(
        `/api/v1/api-credentials/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: "rotate" }),
        }
      );
      const json = (await res.json()) as ApiCredential & {
        error?: string;
        warning?: string;
      };
      if (!res.ok) throw new Error(json.error || "Falha ao rotacionar");
      if (json.secretKey) saveSessionSecret(json.id, json.secretKey);
      // Atualiza na hora (secret + botão copiar com sk_ completa)
      setCreds((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                ...json,
                secretKey: json.secretKey || c.secretKey,
              }
            : c
        )
      );
      setExpandedId(id);
      setFlash(
        json.warning ||
          "Novas chaves geradas. Use o botão copiar na secret."
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao rotacionar");
    } finally {
      setRotatingId(null);
    }
  }

  async function deleteCred(id: string) {
    if (!confirm("Excluir esta credencial? Ação irreversível.")) return;
    setError(null);
    try {
      const { authedFetch } = await import("@/lib/client/session");
      const res = await authedFetch(
        `/api/v1/api-credentials/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Falha ao excluir");
      clearSessionSecret(id);
      setFlash("Credencial excluída.");
      await reload();
      setExpandedId((prev) => (prev === id ? null : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir");
    }
  }

  function handleAddIp(e: FormEvent) {
    e.preventDefault();
    const ip = formIp.trim();
    if (!ip) return;
    const entry: AuthorizedIp = {
      id: `ip_${Date.now().toString(36)}`,
      ip,
      authorizedAt: new Date().toISOString(),
    };
    persistIps([entry, ...ips]);
    setFormIp("");
    setIpOpen(false);
  }

  function deleteIp(id: string) {
    persistIps(ips.filter((i) => i.id !== id));
  }

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      {error ? (
        <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{error}</p>
      ) : null}
      {flash ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>{flash}</p>
      ) : null}

      <div
        className="grid w-full api-creds-layout"
        style={{
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
          alignItems: "start",
        }}
      >
        {/* -- Credenciais de API -- */}
        <section
          className="surface-card flex flex-col min-w-0"
          style={{
            padding: "20px 18px 18px",
            borderRadius: radiusSoft,
            gap: 16,
          }}
        >
          <div className="flex flex-col" style={{ gap: 8 }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h1
                className="font-bold"
                style={{
                  margin: 0,
                  fontSize: 18,
                  color: "var(--text-1)",
                }}
              >
                API de integração
              </h1>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-90"
                  style={{
                    ...btnGhost,
                    textDecoration: "none",
                    height: 42,
                    boxSizing: "border-box",
                  }}
                >
                  Documentação
                  <ExternalLink size={14} strokeWidth={2.25} aria-hidden />
                </Link>
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center transition-opacity hover:opacity-90"
                  style={btnPrimary}
                >
                  Nova credencial
                </button>
              </div>
            </div>
            {/* Exatamente 2 linhas — largura total do card, sem competir com os botões */}
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.45,
                color: "var(--text-2)",
              }}
            >
              <span style={{ display: "block" }}>
                Gerencie suas credenciais de API para integrar com a plataforma.
              </span>
              <span style={{ display: "block" }}>
                Leia a documentação para mais detalhes.
              </span>
            </p>
          </div>

          {!hydrated ? null : creds.length === 0 ? (
            <div
              className="text-center"
              style={{
                padding: "36px 16px",
                borderRadius: radiusSoft,
                background: "var(--bg-app)",
                border: "1px solid var(--border-card)",
                fontSize: 13.5,
                color: "var(--text-3)",
              }}
            >
              Nenhuma credencial ainda. Clique em{" "}
              <strong style={{ color: "var(--text-2)" }}>Nova credencial</strong>.
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 10 }}>
              {creds.map((c) => {
                const open = expandedId === c.id;
                return (
                  <div
                    key={c.id}
                    style={{
                      borderRadius: radiusSoft,
                      /* fundo principal (mais escuro), não o cinza claro */
                      background: "var(--bg-app)",
                      border: "1px solid var(--border-card)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      className="flex items-center gap-2"
                      style={{ padding: "12px 14px" }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(open ? null : c.id)
                        }
                        className="min-w-0 flex-1 flex flex-col text-left"
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        <span
                          className="font-semibold truncate"
                          style={{ fontSize: 14.5, color: "var(--text-1)" }}
                        >
                          {c.name}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--text-3)",
                            marginTop: 2,
                          }}
                        >
                          Criada em {formatDate(c.createdAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        aria-label="Editar"
                        className="flex items-center justify-center shrink-0"
                        style={{
                          width: ACTION_BTN,
                          height: ACTION_BTN,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        {/* Flaticon: editar_4735348 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/icons/editar.png"
                          alt=""
                          width={ACTION_ICON}
                          height={ACTION_ICON}
                          aria-hidden
                          style={{
                            width: ACTION_ICON,
                            height: ACTION_ICON,
                            objectFit: "contain",
                            filter: FILTER_ICON_WHITE,
                            display: "block",
                          }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => rotateKeys(c.id)}
                        aria-label="Gerar novas chaves"
                        disabled={rotatingId === c.id}
                        className="flex items-center justify-center shrink-0"
                        style={{
                          width: ACTION_BTN,
                          height: ACTION_BTN,
                          border: "none",
                          background: "transparent",
                          color: "#ffffff",
                          cursor:
                            rotatingId === c.id ? "wait" : "pointer",
                          borderRadius: "var(--radius-md)",
                          opacity: rotatingId === c.id ? 0.85 : 1,
                        }}
                      >
                        {/* Loader2: só gira no clique; cor branca */}
                        <Loader2
                          size={ACTION_ICON}
                          strokeWidth={2.5}
                          className={
                            rotatingId === c.id ? "animate-spin" : undefined
                          }
                          style={{ color: "#ffffff" }}
                          aria-hidden
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCred(c.id)}
                        aria-label="Excluir"
                        className="flex items-center justify-center shrink-0"
                        style={{
                          width: ACTION_BTN,
                          height: ACTION_BTN,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        {/* Flaticon: lixeira-de-reciclagem_7844035 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/icons/lixeira.png"
                          alt=""
                          width={ACTION_ICON}
                          height={ACTION_ICON}
                          aria-hidden
                          style={{
                            width: ACTION_ICON,
                            height: ACTION_ICON,
                            objectFit: "contain",
                            filter: FILTER_ICON_RED,
                            display: "block",
                          }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(open ? null : c.id)
                        }
                        aria-label={open ? "Recolher" : "Expandir"}
                        className="flex items-center justify-center shrink-0"
                        style={{
                          width: 32,
                          height: 32,
                          border: "none",
                          background: "transparent",
                          color: "var(--text-2)",
                          cursor: "pointer",
                          borderRadius: "var(--radius-md)",
                        }}
                      >
                        {open ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    </div>

                    {open ? (
                      <div
                        className="flex flex-col"
                        style={{
                          padding: "0 14px 14px",
                          gap: 14,
                          borderTop: "1px solid var(--border-card)",
                          paddingTop: 14,
                        }}
                      >
                        <SecretRow
                          label="Chave Pública (Client ID)"
                          value={c.publicKey}
                          canCopy
                        />
                        {(() => {
                          const full = resolveSecretFull(c);
                          const expired = isCredentialExpired(c.expiresAt);
                          return (
                            <>
                              <SecretRow
                                label="Chave Privada (Client Secret)"
                                value={maskSecretForDisplay(
                                  full,
                                  c.secretKeyHint
                                )}
                                secretMode
                                fullSecret={full}
                                canCopy
                                onReveal={async () => {
                                  try {
                                    const { authedFetch } = await import(
                                      "@/lib/client/session"
                                    );
                                    const res = await authedFetch(
                                      `/api/v1/api-credentials/${encodeURIComponent(c.id)}`,
                                      {
                                        method: "POST",
                                        headers: {
                                          "content-type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          action: "reveal",
                                        }),
                                      }
                                    );
                                    const json = (await res.json()) as {
                                      secretKey?: string | null;
                                      error?: string;
                                    };
                                    if (!res.ok || !json.secretKey) {
                                      setError(
                                        json.error ||
                                          "Não foi possível revelar a secret"
                                      );
                                      return null;
                                    }
                                    saveSessionSecret(c.id, json.secretKey);
                                    setCreds((prev) =>
                                      prev.map((x) =>
                                        x.id === c.id
                                          ? { ...x, secretKey: json.secretKey! }
                                          : x
                                      )
                                    );
                                    return json.secretKey;
                                  } catch (e) {
                                    setError(
                                      e instanceof Error
                                        ? e.message
                                        : "Falha ao revelar secret"
                                    );
                                    return null;
                                  }
                                }}
                              />
                              {expired ? (
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: 13,
                                    color: "#f87171",
                                    lineHeight: 1.45,
                                    fontWeight: 600,
                                  }}
                                >
                                  Chave de API expirada. Realize o reset
                                  (rotacionar) da sua chave para gerar uma
                                  nova.
                                </p>
                              ) : null}
                            </>
                          );
                        })()}

                        <div>
                          <span
                            style={{
                              fontSize: 12.5,
                              color: "var(--text-3)",
                              fontWeight: 500,
                            }}
                          >
                            Data de Expiração
                          </span>
                          <div style={{ marginTop: 8 }}>
                            {(() => {
                              const expired = isCredentialExpired(c.expiresAt);
                              const never = !c.expiresAt;
                              return (
                                <span
                                  className="inline-flex items-center font-semibold"
                                  style={{
                                    height: 30,
                                    padding: "0 12px",
                                    borderRadius: 10,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    background: expired
                                      ? "#ef4444"
                                      : never
                                        ? "#ffffff"
                                        : "#eab308",
                                    color:
                                      never || !expired
                                        ? "#0a0f0c"
                                        : "#ffffff",
                                  }}
                                >
                                  {expired
                                    ? `Expirada em ${formatDate(c.expiresAt!)}`
                                    : never
                                      ? "Nunca expira"
                                      : `Expira em ${formatDate(c.expiresAt!)}`}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        <div>
                          <span
                            style={{
                              fontSize: 12.5,
                              color: "var(--text-3)",
                              fontWeight: 500,
                            }}
                          >
                            Permissões
                          </span>
                          <div
                            className="flex flex-wrap"
                            style={{ gap: 6, marginTop: 8 }}
                          >
                            {c.permissions.length === 0 ? (
                              <span
                                style={{
                                  fontSize: 12.5,
                                  color: "var(--text-3)",
                                }}
                              >
                                Nenhuma permissão
                              </span>
                            ) : (
                              c.permissions.map((p) => {
                                const opt = PERMISSION_OPTIONS.find(
                                  (o) => o.id === p
                                );
                                return (
                                  <span
                                    key={p}
                                    className="inline-flex items-center font-medium"
                                    style={{
                                      height: 30,
                                      padding: "0 12px",
                                      /* quatro cantinhos arredondados (não pill) */
                                      borderRadius: 10,
                                      fontSize: 12,
                                      fontWeight: 600,
                                      background: "#ffffff",
                                      border: "none",
                                      color: "#0a0f0c",
                                    }}
                                  >
                                    {opt?.label ?? p}
                                  </span>
                                );
                              })
                            )}
                          </div>
                          {c.requireManualSaqueApproval ? (
                            <p
                              style={{
                                margin: "10px 0 0",
                                fontSize: 12,
                                color: "var(--text-3)",
                              }}
                            >
                              Saques via API exigem aprovação manual no painel.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* -- IPs Autorizados -- */}
        <section
          className="surface-card flex flex-col min-w-0"
          style={{
            padding: "20px 18px 18px",
            borderRadius: radiusSoft,
            gap: 16,
          }}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <h2
                className="font-bold"
                style={{
                  margin: 0,
                  fontSize: 18,
                  color: "var(--text-1)",
                }}
              >
                IPs Autorizados
              </h2>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: "var(--text-2)",
                }}
              >
                O bloqueio de IP serve apenas para travar solicitações de
                transferências via API.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormIp("");
                setIpOpen(true);
              }}
              className="inline-flex items-center shrink-0 transition-opacity hover:opacity-90"
              style={btnPrimary}
            >
              Adicionar IP
            </button>
          </div>

          <div
            className="overflow-hidden flex-1"
            style={{
              borderRadius: radiusSoft,
              border: "1px solid var(--border-card)",
              /* fundo principal escuro (mesmo padrão das credenciais) */
              background: "var(--bg-app)",
              minHeight: 220,
            }}
          >
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["IP", "Data de autorização", "Ações"].map((h) => (
                    <th
                      key={h}
                      className="text-left font-medium"
                      style={{
                        padding: "12px 14px",
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
                {!hydrated ? null : ips.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="text-center"
                      style={{
                        padding: "48px 16px",
                        fontSize: 13.5,
                        color: "var(--text-3)",
                      }}
                    >
                      Nenhum IP autorizado
                    </td>
                  </tr>
                ) : (
                  ips.map((row) => (
                    <tr key={row.id}>
                      <td
                        className="tabular font-medium"
                        style={{
                          padding: "12px 14px",
                          fontSize: 13.5,
                          color: "var(--text-1)",
                          borderBottom: "1px solid var(--border-card)",
                        }}
                      >
                        {row.ip}
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          fontSize: 13,
                          color: "var(--text-2)",
                          borderBottom: "1px solid var(--border-card)",
                        }}
                      >
                        {formatDateTime(row.authorizedAt)}
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          borderBottom: "1px solid var(--border-card)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => deleteIp(row.id)}
                          aria-label="Remover IP"
                          className="inline-flex items-center justify-center transition-opacity hover:opacity-90"
                          style={{
                            width: ACTION_BTN,
                            height: ACTION_BTN,
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            borderRadius: "var(--radius-md)",
                            padding: 0,
                          }}
                        >
                          {/* Mesmo ícone/cor do botão de lixeira das credenciais */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src="/icons/lixeira.png"
                            alt=""
                            width={ACTION_ICON}
                            height={ACTION_ICON}
                            aria-hidden
                            style={{
                              width: ACTION_ICON,
                              height: ACTION_ICON,
                              objectFit: "contain",
                              filter: FILTER_ICON_RED,
                              display: "block",
                            }}
                          />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Modal criar/editar credencial */}
      {createOpen ? (
        <ModalShell
          title={editId ? "Editar credencial" : "Criar Nova Credencial"}
          onClose={() => setCreateOpen(false)}
          maxWidth={460}
          footer={
            <>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                style={btnGhost}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="form-cred"
                style={{
                  ...btnPrimary,
                  opacity: saving ? 0.7 : 1,
                  cursor: saving ? "wait" : "pointer",
                }}
                disabled={saving}
              >
                {saving ? "Salvando…" : editId ? "Salvar" : "Criar"}
              </button>
            </>
          }
        >
          <form
            id="form-cred"
            onSubmit={handleSaveCredential}
            className="flex flex-col"
            style={{ gap: 16 }}
          >
            <label className="flex flex-col gap-1.5">
              <span
                style={{
                  fontSize: 12.5,
                  color: "var(--text-3)",
                  fontWeight: 500,
                }}
              >
                Nome da Credencial
              </span>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Cassino produção"
                style={inputStyle}
                autoFocus
              />
            </label>

            <div>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-1)",
                  fontWeight: 600,
                }}
              >
                Permissões
              </span>
              <div className="flex flex-col" style={{ gap: 10, marginTop: 10 }}>
                {PERMISSION_OPTIONS.map((opt) => {
                  const on = formPerms.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className="flex items-center gap-2.5"
                      style={{ cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => togglePerm(opt.id)}
                        style={{
                          width: 16,
                          height: 16,
                          accentColor: "#ffffff",
                          cursor: "pointer",
                        }}
                      />
                      <span style={{ fontSize: 13.5, color: "var(--text-1)" }}>
                        {opt.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span
                style={{
                  fontSize: 12.5,
                  color: "var(--text-3)",
                  fontWeight: 500,
                }}
              >
                Data de Expiração (Opcional)
              </span>
              <input
                type="date"
                value={formExpires}
                onChange={(e) => setFormExpires(e.target.value)}
                style={inputStyle}
              />
            </label>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-card)",
                background: "var(--bg-elevated)",
              }}
            >
              <p
                className="font-semibold"
                style={{
                  margin: "0 0 10px",
                  fontSize: 13,
                  color: "var(--text-1)",
                }}
              >
                Configurações de saque
              </p>
              <label
                className="flex items-start gap-2.5"
                style={{ cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={formManualSaque}
                  onChange={(e) => setFormManualSaque(e.target.checked)}
                  style={{
                    width: 16,
                    height: 16,
                    marginTop: 2,
                    accentColor: "#ffffff",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
                <span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 13.5,
                      color: "var(--text-1)",
                      fontWeight: 500,
                    }}
                  >
                    Exigir aprovação manual minha para saques via API
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12,
                      color: "var(--text-3)",
                      marginTop: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    Quando ativo, transferências criadas com esta credencial
                    precisam ser aprovadas manualmente no painel antes de
                    enviar o saque.
                  </span>
                </span>
              </label>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {/* Modal IP */}
      {ipOpen ? (
        <ModalShell
          title="Adicionar um IP"
          onClose={() => setIpOpen(false)}
          maxWidth={400}
          footer={
            <>
              <button
                type="button"
                onClick={() => setIpOpen(false)}
                style={btnGhost}
              >
                Cancelar
              </button>
              <button type="submit" form="form-ip" style={btnPrimary}>
                Adicionar
              </button>
            </>
          }
        >
          <form id="form-ip" onSubmit={handleAddIp}>
            <label className="flex flex-col gap-1.5">
              <span
                style={{
                  fontSize: 12.5,
                  color: "var(--text-3)",
                  fontWeight: 500,
                }}
              >
                IP
              </span>
              <input
                type="text"
                value={formIp}
                onChange={(e) => setFormIp(e.target.value)}
                placeholder="192.168.0.1 ou 2001:db8::1"
                style={inputStyle}
                autoFocus
                required
              />
            </label>
          </form>
        </ModalShell>
      ) : null}

    </div>
  );
}
