"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Check, Search, X } from "lucide-react";
import {
  adminUsersMock,
  DEFAULT_GERENTE_PERMISSIONS,
  GERENTE_PERMISSION_OPTIONS,
  type AdminGerente,
  type AdminUser,
  type GerentePermission,
} from "@/lib/mock/admin";

interface AdminGerenteCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (gerente: AdminGerente) => void;
  /** E-mails já promovidos a gerente (evita duplicar) */
  existingEmails?: string[];
}

/** Mesmo shell dos campos do modal de detalhe (seller / gerente) */
const fieldShell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 14px",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-card)",
  minHeight: 58,
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
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--text-3)",
  fontWeight: 500,
};

const bodyTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  color: "var(--text-3)",
  lineHeight: 1.4,
};

const footerBtnBase: CSSProperties = {
  height: 38,
  padding: "0 18px",
  borderRadius: "var(--radius-md)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function matchesQuery(user: AdminUser, q: string): boolean {
  const raw = q.trim().toLowerCase();
  if (!raw) return false;
  const qDigits = digitsOnly(raw);
  if (user.email.toLowerCase().includes(raw)) return true;
  if (user.name.toLowerCase().includes(raw)) return true;
  if (user.id.toLowerCase().includes(raw)) return true;
  if (qDigits.length >= 3) {
    if (digitsOnly(user.document).includes(qDigits)) return true;
    if (user.cnpj && digitsOnly(user.cnpj).includes(qDigits)) return true;
  }
  return false;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AdminGerenteCreateModal({
  open,
  onClose,
  onCreate,
  existingEmails = [],
}: AdminGerenteCreateModalProps) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [permissions, setPermissions] = useState<GerentePermission[]>([
    ...DEFAULT_GERENTE_PERMISSIONS,
  ]);

  const existingSet = useMemo(
    () => new Set(existingEmails.map((e) => e.toLowerCase())),
    [existingEmails]
  );

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return adminUsersMock
      .filter((u) => matchesQuery(u, query))
      .filter((u) => !existingSet.has(u.email.toLowerCase()))
      .slice(0, 8);
  }, [query, existingSet]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(null);
      setPermissions([...DEFAULT_GERENTE_PERMISSIONS]);
      return;
    }
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
  }, [open, onClose]);

  if (!open) return null;

  function togglePermission(id: GerentePermission) {
    setPermissions((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function handlePromote() {
    if (!selected || permissions.length === 0) return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const createdAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`;

    onCreate({
      id: `mgr_${Date.now().toString(36)}`,
      name: selected.name,
      email: selected.email,
      phone: selected.phone,
      status: "ativo",
      sellersCount: 0,
      volumeTotal: selected.volumeTotal,
      createdAt,
      userId: selected.id,
      document: selected.document,
      permissions: [...permissions],
    });
    onClose();
  }

  const canSubmit = !!selected && permissions.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 border-0"
        style={{ background: "rgba(0, 0, 0, 0.62)" }}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full surface-card flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          maxWidth: 560,
          maxHeight: "min(90vh, 760px)",
          borderRadius: "var(--radius-card)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        {/* X — mesmo padrão do modal de detalhe */}
        <div
          className="flex items-center justify-end shrink-0"
          style={{ padding: "16px 20px 0" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="flex items-center justify-center transition-colors"
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--radius-md)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-muted)",
              color: "var(--text-2)",
              cursor: "pointer",
            }}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Título */}
        <div
          className="shrink-0"
          style={{ padding: "0 24px 14px" }}
        >
          <h2
            id={titleId}
            className="font-bold"
            style={{
              margin: 0,
              fontSize: 20,
              color: "var(--text-1)",
              lineHeight: 1.25,
            }}
          >
            Novo gerente
          </h2>
        </div>

        <div
          className="flex-1 overflow-y-auto min-h-0 flex flex-col"
          style={{ padding: "4px 24px 8px", gap: 20 }}
        >
          {/* Buscar usuário */}
          <div className="flex flex-col" style={{ gap: 8 }}>
            <p style={sectionTitleStyle}>Buscar usuário</p>

            <div
              className="flex items-center gap-2 w-full min-w-0"
              style={{
                height: 42,
                padding: "0 12px 0 10px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-card)",
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
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                }}
                placeholder="Nome, e-mail ou CPF…"
                className="min-w-0 flex-1 outline-none border-0 bg-transparent"
                style={{
                  ...inputStyle,
                  fontSize: 13.5,
                  height: "100%",
                }}
                autoFocus
                aria-label="Buscar por nome, e-mail ou CPF"
              />
            </div>

            {/* Resultados */}
            {!selected && query.trim() ? (
              <div
                className="flex flex-col overflow-hidden"
                style={{
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-card)",
                  background: "var(--bg-elevated)",
                  maxHeight: 200,
                  overflowY: "auto",
                }}
              >
                {results.length === 0 ? (
                  <p
                    style={{
                      ...bodyTextStyle,
                      padding: "14px",
                      textAlign: "center",
                    }}
                  >
                    Nenhum usuário encontrado
                  </p>
                ) : (
                  results.map((u, i) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelected(u);
                        setQuery(u.email);
                      }}
                      className="flex items-center gap-3 w-full text-left transition-opacity hover:opacity-90"
                      style={{
                        padding: "10px 14px",
                        border: "none",
                        borderBottom:
                          i < results.length - 1
                            ? "1px solid var(--border-card)"
                            : "none",
                        background: "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        className="flex items-center justify-center font-bold shrink-0"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "var(--radius-full)",
                          background: "var(--bg-card)",
                          color: "var(--green-use)",
                          fontSize: 12,
                          boxShadow: "0 0 0 1px var(--border-card)",
                        }}
                      >
                        {initials(u.name)}
                      </span>
                      <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                        <span
                          className="font-medium truncate"
                          style={{ fontSize: 14, color: "var(--text-1)" }}
                        >
                          {u.name}
                        </span>
                        <span
                          className="truncate"
                          style={{ fontSize: 12, color: "var(--text-3)" }}
                        >
                          {u.email} · CPF {u.document}
                        </span>
                      </span>
                      <span
                        className="font-semibold shrink-0"
                        style={{ fontSize: 12, color: "var(--text-2)" }}
                      >
                        Selecionar
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}

            {/* Usuário selecionado */}
            {selected ? (
              <div
                className="flex items-center gap-3"
                style={{
                  ...fieldShell,
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: 64,
                  gap: 12,
                }}
              >
                <span
                  className="flex items-center justify-center font-bold shrink-0"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "var(--radius-full)",
                    background: "var(--bg-card)",
                    color: "var(--green-use)",
                    fontSize: 13,
                    boxShadow: "0 0 0 1px var(--border-card)",
                  }}
                >
                  {initials(selected.name)}
                </span>
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <span
                    className="font-medium truncate"
                    style={{ fontSize: 14, color: "var(--text-1)" }}
                  >
                    {selected.name}
                  </span>
                  <span
                    className="truncate"
                    style={{ fontSize: 12, color: "var(--text-3)" }}
                  >
                    {selected.email} · {selected.phone}
                  </span>
                  <span
                    className="tabular truncate"
                    style={{ fontSize: 12, color: "var(--text-3)" }}
                  >
                    CPF {selected.document} · ID {selected.id}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setQuery("");
                  }}
                  className="font-semibold shrink-0 transition-opacity hover:opacity-90"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--text-2)",
                    fontSize: 13,
                    cursor: "pointer",
                    padding: "4px 6px",
                  }}
                >
                  Trocar
                </button>
              </div>
            ) : null}
          </div>

          {/* Habilidades */}
          <div className="flex flex-col" style={{ gap: 8 }}>
            <p style={sectionTitleStyle}>Habilidades de acesso</p>
            <p style={bodyTextStyle}>
              Escolha o que esse gerente poderá usar no painel.
            </p>

            <div className="flex flex-col" style={{ gap: 8 }}>
              {GERENTE_PERMISSION_OPTIONS.map((opt) => {
                const on = permissions.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => togglePermission(opt.id)}
                    className="flex items-center gap-3 w-full text-left transition-opacity hover:opacity-90"
                    style={{
                      ...fieldShell,
                      flexDirection: "row",
                      alignItems: "center",
                      minHeight: 58,
                      gap: 12,
                      cursor: "pointer",
                      background: "var(--bg-elevated)",
                    }}
                  >
                    <span
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        border: on
                          ? "none"
                          : "1.5px solid var(--border-muted)",
                        background: on ? "#ffffff" : "transparent",
                      }}
                    >
                      {on ? (
                        <Check
                          size={13}
                          strokeWidth={3}
                          style={{ color: "#0a0f0c" }}
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex flex-col gap-0.5">
                      <span
                        className="font-medium"
                        style={{ fontSize: 14, color: "var(--text-1)" }}
                      >
                        {opt.label}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-3)",
                          lineHeight: 1.35,
                        }}
                      >
                        {opt.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer — mesmo padrão dos outros modais */}
        <div
          className="flex flex-wrap items-center justify-end gap-2.5 shrink-0"
          style={{ padding: "8px 24px 20px" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
            style={{
              ...footerBtnBase,
              border: "1px solid var(--border-muted)",
              background: "var(--bg-elevated)",
              color: "var(--text-1)",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handlePromote}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
            style={{
              ...footerBtnBase,
              border: "none",
              background: "#ffffff",
              color: "#0a0f0c",
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.45,
            }}
          >
            Transformar em gerente
          </button>
        </div>
      </div>
    </div>
  );
}
