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
import { Check, X } from "lucide-react";

const STORAGE_KEY = "darkpay.webhooks.v1";

export type WebhookEvent =
  | "payment.created"
  | "payment.paid"
  | "payment.refused"
  | "payment.expired"
  | "payment.refunded"
  | "transfer.created"
  | "transfer.paid"
  | "transfer.refused"
  | "chargeback.created";

const EVENT_OPTIONS: { id: WebhookEvent; label: string }[] = [
  { id: "payment.created", label: "Pagamento criado" },
  { id: "payment.paid", label: "Pagamento pago" },
  { id: "payment.refused", label: "Pagamento recusado" },
  { id: "payment.expired", label: "Pagamento expirado" },
  { id: "payment.refunded", label: "Pagamento estornado" },
  { id: "transfer.created", label: "Transferência criada" },
  { id: "transfer.paid", label: "Transferência paga" },
  { id: "transfer.refused", label: "Transferência recusada" },
  { id: "chargeback.created", label: "Chargeback criado" },
];

export interface WebhookEndpoint {
  id: string;
  name: string;
  callbackUrl: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

const ACTION_ICON = 18;
const ACTION_BTN = 36;
const FILTER_ICON_RED =
  "brightness(0) saturate(100%) invert(36%) sepia(86%) saturate(2476%) hue-rotate(338deg) brightness(98%) contrast(96%)";
const FILTER_ICON_WHITE = "brightness(0) saturate(100%) invert(1)";

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

const inputStyle: CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 14px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-card)",
  background: "var(--bg-app)",
  color: "var(--text-1)",
  fontSize: 14,
  fontWeight: 500,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const radiusSoft = "var(--radius-card)" as const;
const radiusBtn = "var(--radius-md)" as const;

const overlayBackdrop: CSSProperties = {
  background: "rgba(0, 0, 0, 0.62)",
};

const modalSurface: CSSProperties = {
  maxWidth: 480,
  borderRadius: "var(--radius-md)",
  boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
  overflow: "hidden",
  zIndex: 1,
};

function randomPart(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const arr = new Uint8Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  } else {
    for (let i = 0; i < len; i++)
      out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* ignore */
        }
      }}
      aria-label="Copiar"
      className="flex items-center justify-center shrink-0 transition-opacity hover:opacity-90"
      style={{
        width: 36,
        height: 36,
        borderRadius: radiusBtn,
        border: "none",
        background: copied ? "#22c55e" : "#ffffff",
        color: copied ? "#fff" : "#0a0f0c",
        cursor: "pointer",
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
            filter: "brightness(0)",
            display: "block",
          }}
        />
      )}
    </button>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  footer,
  maxWidth = 480,
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
        style={{ ...modalSurface, maxWidth }}
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

export function WebhooksView() {
  const [hooks, setHooks] = useState<WebhookEndpoint[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<WebhookEvent[]>([
    "payment.paid",
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setHooks(loadJson<WebhookEndpoint[]>(STORAGE_KEY, []));
    setHydrated(true);
  }, []);

  const persist = useCallback((next: WebhookEndpoint[]) => {
    setHooks(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  function openCreate() {
    setEditId(null);
    setFormName("");
    setFormUrl("");
    setFormEvents(["payment.paid"]);
    setFormError(null);
    setCreateOpen(true);
  }

  function openEdit(h: WebhookEndpoint) {
    setEditId(h.id);
    setFormName(h.name);
    setFormUrl(h.callbackUrl);
    setFormEvents([...h.events]);
    setFormError(null);
    setCreateOpen(true);
  }

  function toggleEvent(id: WebhookEvent) {
    setFormEvents((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    const name = formName.trim() || "Webhook";
    const url = formUrl.trim();

    if (!url) {
      setFormError("Informe a Callback URL.");
      return;
    }
    if (!isValidUrl(url)) {
      setFormError("Callback URL inválida. Use http:// ou https://");
      return;
    }
    if (formEvents.length === 0) {
      setFormError("Selecione pelo menos um evento.");
      return;
    }

    setFormError(null);

    if (editId) {
      persist(
        hooks.map((h) =>
          h.id === editId
            ? {
                ...h,
                name,
                callbackUrl: url,
                events: formEvents,
              }
            : h
        )
      );
    } else {
      const created: WebhookEndpoint = {
        id: `wh_${randomPart(10)}`,
        name,
        callbackUrl: url,
        events: formEvents,
        active: true,
        createdAt: new Date().toISOString(),
      };
      persist([created, ...hooks]);
    }
    setCreateOpen(false);
  }

  function deleteHook(id: string) {
    if (!confirm("Remover este webhook?")) return;
    persist(hooks.filter((h) => h.id !== id));
  }

  function toggleActive(id: string) {
    persist(
      hooks.map((h) => (h.id === id ? { ...h, active: !h.active } : h))
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <section
        className="surface-card flex flex-col"
        style={{
          padding: "20px 18px 18px",
          borderRadius: radiusSoft,
          gap: 16,
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1 flex items-start gap-3.5">
            <span
              className="flex shrink-0 items-center justify-center overflow-hidden"
              style={{
                width: 48,
                height: 48,
                borderRadius: "var(--radius-sm)",
                backgroundImage: "url(/icons/webhook-logo.webp)",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              aria-hidden
            />
            <div className="min-w-0">
              <h1
                className="font-bold"
                style={{
                  margin: 0,
                  fontSize: 18,
                  color: "var(--text-1)",
                }}
              >
                Webhooks
              </h1>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: "var(--text-2)",
                }}
              >
                Cadastre Callback URLs para receber eventos de pagamento e
                transferências em tempo real.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center shrink-0 transition-opacity hover:opacity-90"
            style={btnPrimary}
          >
            Novo webhook
          </button>
        </div>

        {!hydrated ? null : hooks.length === 0 ? (
          <div
            className="text-center"
            style={{
              padding: "40px 16px",
              borderRadius: radiusSoft,
              background: "var(--bg-app)",
              border: "1px solid var(--border-card)",
              fontSize: 13.5,
              color: "var(--text-3)",
            }}
          >
            Nenhum webhook cadastrado. Clique em{" "}
            <strong style={{ color: "var(--text-2)" }}>Novo webhook</strong> e
            informe a Callback URL.
          </div>
        ) : (
          <div
            className="overflow-hidden"
            style={{
              borderRadius: radiusSoft,
              border: "1px solid var(--border-card)",
              background: "var(--bg-app)",
            }}
          >
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    "Nome",
                    "Callback URL",
                    "Eventos",
                    "Status",
                    "Criado em",
                    "Ações",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left font-medium"
                      style={{
                        padding: "12px 14px",
                        fontSize: 12,
                        color: "var(--text-3)",
                        borderBottom: "1px solid var(--border-card)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hooks.map((row) => (
                  <tr key={row.id}>
                    <td
                      className="font-medium"
                      style={{
                        padding: "14px",
                        fontSize: 13.5,
                        color: "var(--text-1)",
                        borderBottom: "1px solid var(--border-card)",
                        maxWidth: 140,
                      }}
                    >
                      {row.name}
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        borderBottom: "1px solid var(--border-card)",
                        maxWidth: 280,
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="min-w-0 truncate"
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: "var(--text-1)",
                            fontFamily: "inherit",
                          }}
                          title={row.callbackUrl}
                        >
                          {row.callbackUrl}
                        </span>
                        <CopyButton value={row.callbackUrl} />
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        borderBottom: "1px solid var(--border-card)",
                      }}
                    >
                      <div
                        className="flex flex-wrap"
                        style={{ gap: 5, maxWidth: 220 }}
                      >
                        {row.events.slice(0, 3).map((ev) => (
                          <span
                            key={ev}
                            className="inline-flex items-center font-medium"
                            style={{
                              height: 24,
                              padding: "0 8px",
                              borderRadius: 10,
                              fontSize: 11,
                              fontWeight: 600,
                              background: "#ffffff",
                              color: "#0a0f0c",
                            }}
                          >
                            {ev}
                          </span>
                        ))}
                        {row.events.length > 3 ? (
                          <span
                            style={{
                              fontSize: 11.5,
                              color: "var(--text-3)",
                              alignSelf: "center",
                            }}
                          >
                            +{row.events.length - 3}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        borderBottom: "1px solid var(--border-card)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleActive(row.id)}
                        className="inline-flex items-center font-semibold"
                        style={{
                          height: 26,
                          padding: "0 10px",
                          borderRadius: 10,
                          fontSize: 11.5,
                          border: row.active
                            ? "none"
                            : "1px solid var(--border-muted)",
                          background: row.active
                            ? "#ffffff"
                            : "var(--bg-elevated)",
                          color: row.active ? "#0a0f0c" : "var(--text-3)",
                          cursor: "pointer",
                        }}
                      >
                        {row.active ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        fontSize: 13,
                        color: "var(--text-2)",
                        borderBottom: "1px solid var(--border-card)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDate(row.createdAt)}
                    </td>
                    <td
                      style={{
                        padding: "14px",
                        borderBottom: "1px solid var(--border-card)",
                      }}
                    >
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
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
                          onClick={() => deleteHook(row.id)}
                          aria-label="Remover"
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {createOpen ? (
        <ModalShell
          title={editId ? "Editar webhook" : "Novo webhook"}
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                style={btnGhost}
              >
                Cancelar
              </button>
              <button type="submit" form="form-webhook" style={btnPrimary}>
                {editId ? "Salvar" : "Criar"}
              </button>
            </>
          }
        >
          <form
            id="form-webhook"
            onSubmit={handleSave}
            className="flex flex-col"
            style={{ gap: 14 }}
          >
            <label className="flex flex-col gap-1.5">
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 650,
                  color: "var(--text-2)",
                }}
              >
                Nome
              </span>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex.: Produção, Checkout, ERP"
                style={inputStyle}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 650,
                  color: "var(--text-2)",
                }}
              >
                Callback URL
              </span>
              <input
                type="url"
                value={formUrl}
                onChange={(e) => {
                  setFormUrl(e.target.value);
                  if (formError) setFormError(null);
                }}
                placeholder="https://seu-dominio.com/webhooks/darkpay"
                style={inputStyle}
                required
              />
              <span
                style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.4 }}
              >
                URL do seu servidor que receberá os eventos via POST JSON.
              </span>
            </label>

            <div className="flex flex-col gap-1.5">
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 650,
                  color: "var(--text-2)",
                }}
              >
                Eventos
              </span>
              <div
                className="flex flex-col"
                style={{
                  gap: 6,
                  maxHeight: 200,
                  overflowY: "auto",
                  padding: 10,
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-card)",
                }}
              >
                {EVENT_OPTIONS.map((opt) => {
                  const on = formEvents.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className="flex items-center gap-2.5 cursor-pointer"
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        background: on ? "var(--bg-card)" : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleEvent(opt.id)}
                        style={{ width: 15, height: 15, accentColor: "#fff" }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--text-1)",
                          fontWeight: on ? 600 : 500,
                        }}
                      >
                        {opt.label}
                      </span>
                      <span
                        style={{
                          fontSize: 11.5,
                          color: "var(--text-3)",
                          marginLeft: "auto",
                        }}
                      >
                        {opt.id}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {formError ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "#f87171",
                }}
              >
                {formError}
              </p>
            ) : null}
          </form>
        </ModalShell>
      ) : null}
    </div>
  );
}
