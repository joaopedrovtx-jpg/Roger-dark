"use client";

import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Camera,
  ExternalLink,
  FileText,
  IdCard,
  X,
} from "lucide-react";
import { formatBRL, formatChartDate } from "@/lib/format";
import {
  adquirentesMock,
  DEFAULT_SELLER_FEES,
  getSellerDocPreviews,
  type AdminUser,
  type DocReviewStatus,
  type SellerDocKind,
  type SellerFees,
  type UserStatus,
} from "@/lib/mock/admin";

type DocStatusMap = Partial<Record<SellerDocKind, DocReviewStatus>>;

type DetailTab = "dados" | "documentos" | "taxas" | "adquirentes";

type DocPreviewItem = ReturnType<typeof getSellerDocPreviews>[number];

interface AdminUserDetailModalProps {
  user: AdminUser | null;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (id: string, status: UserStatus) => void;
  onSaveFees?: (id: string, fees: SellerFees) => void | Promise<void>;
  onSaveDocs?: (
    id: string,
    status: "aprovado" | "pendente" | "rejeitado"
  ) => void | Promise<void>;
  onSaveRouting?: (
    id: string,
    data: { saqueAutomatico?: boolean; adquirenteIds?: string[] }
  ) => void | Promise<void>;
  /** Aba inicial ao abrir (ex.: documentos na fila de compliance) */
  initialTab?: DetailTab;
}

/**
 * Inputs com a mesma cor de fundo das abas (--bg-elevated),
 * cantos arredondados no padrão da plataforma.
 */
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

function formatDateTime(iso: string): string {
  const date = formatChartDate(iso);
  const time = iso.includes("T") ? iso.split("T")[1].slice(0, 5) : "";
  return time ? `${date} ${time}` : date;
}

function statusLabel(s: UserStatus): string {
  if (s === "ativo") return "Ativo";
  if (s === "bloqueado") return "Bloqueado";
  return "Pendente";
}

function statusTone(s: UserStatus): "success" | "danger" | "warning" {
  if (s === "ativo") return "success";
  if (s === "bloqueado") return "danger";
  return "warning";
}

/** Cores do adesivo de status ao lado do nome (fundo sólido) */
function statusBadgeColors(s: UserStatus): {
  background: string;
  color: string;
} {
  if (s === "ativo") return { background: "#ffffff", color: "#0a0f0c" };
  if (s === "bloqueado") return { background: "#ef4444", color: "#ffffff" };
  // pendente — amarelo
  return { background: "#eab308", color: "#0a0f0c" };
}

function docStatusLabel(s: DocReviewStatus): string {
  if (s === "aprovado") return "Aprovado";
  if (s === "rejeitado") return "Rejeitado";
  return "Em análise";
}

/** Aprovado = branco · Em análise = amarelo · Rejeitado = vermelho */
function docStatusBadgeColors(s: DocReviewStatus): {
  background: string;
  color: string;
} {
  if (s === "aprovado") return { background: "#ffffff", color: "#0a0f0c" };
  if (s === "rejeitado") return { background: "#ef4444", color: "#ffffff" };
  // pendente / em análise
  return { background: "#eab308", color: "#0a0f0c" };
}

/**
 * Conta bloqueada → badge "Bloqueado" (vermelho).
 * Caso contrário → status real do documento.
 */
function resolveDocBadge(
  accountStatus: UserStatus,
  docStatus: DocReviewStatus
): { label: string; background: string; color: string } {
  if (accountStatus === "bloqueado") {
    return {
      label: "Bloqueado",
      background: "#ef4444",
      color: "#ffffff",
    };
  }
  return {
    label: docStatusLabel(docStatus),
    ...docStatusBadgeColors(docStatus),
  };
}

function DocKindIcon({
  kind,
  size = 28,
  color = "var(--text-3)",
}: {
  kind: SellerDocKind;
  size?: number;
  color?: string;
}) {
  if (kind === "selfie")
    return <Camera size={size} strokeWidth={1.5} style={{ color }} />;
  if (kind === "contrato_social")
    return <Building2 size={size} strokeWidth={1.5} style={{ color }} />;
  if (kind === "doc_verso")
    return <IdCard size={size} strokeWidth={1.5} style={{ color }} />;
  return <FileText size={size} strokeWidth={1.5} style={{ color }} />;
}

/**
 * Superfície mock do documento (atrás do blur).
 * Em produção seria a imagem real enviada pelo seller.
 */
function DocMockSurface({
  kind,
  sharp = false,
}: {
  kind: SellerDocKind;
  sharp?: boolean;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 16,
        background:
          kind === "selfie"
            ? "linear-gradient(145deg, #2a3140 0%, #1a1e26 55%, #12151a 100%)"
            : kind === "contrato_social"
              ? "linear-gradient(145deg, #252a35 0%, #181c24 100%)"
              : "linear-gradient(145deg, #2c3340 0%, #1c2028 50%, #14181f 100%)",
        filter: sharp ? "none" : "blur(7px) saturate(0.85)",
        transform: sharp ? "none" : "scale(1.06)",
      }}
    >
      {/* Linhas fake de documento */}
      <div
        style={{
          width: "72%",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          opacity: 0.55,
        }}
      >
        <div
          style={{
            height: 10,
            borderRadius: 4,
            background: "rgba(255,255,255,0.22)",
            width: "48%",
          }}
        />
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "rgba(255,255,255,0.14)",
            width: "100%",
          }}
        />
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "rgba(255,255,255,0.12)",
            width: "88%",
          }}
        />
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "rgba(255,255,255,0.1)",
            width: "70%",
          }}
        />
        {kind === "contrato_social" ? (
          <>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: "rgba(255,255,255,0.1)",
                width: "95%",
                marginTop: 6,
              }}
            />
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: "rgba(255,255,255,0.08)",
                width: "80%",
              }}
            />
          </>
        ) : null}
      </div>
      <DocKindIcon
        kind={kind}
        size={sharp ? 40 : 36}
        color="rgba(255,255,255,0.35)"
      />
    </div>
  );
}

/** Lightbox — documento aberto em tela cheia (estética do modal DarkPay) */
function DocViewerLightbox({
  doc,
  onClose,
}: {
  doc: DocPreviewItem;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Fechar visualização"
        className="absolute inset-0 border-0"
        style={{ background: "rgba(0, 0, 0, 0.78)" }}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={doc.typeLabel}
        className="relative w-full surface-card flex flex-col"
        style={{
          maxWidth: 520,
          maxHeight: "min(88vh, 720px)",
          borderRadius: "var(--radius-card)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        <div
          className="flex items-center justify-between gap-3 shrink-0"
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border-card)",
          }}
        >
          <div className="min-w-0">
            <p
              className="font-semibold truncate"
              style={{ margin: 0, fontSize: 15, color: "var(--text-1)" }}
            >
              {doc.typeLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex items-center justify-center shrink-0"
            style={{
              width: 34,
              height: 34,
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

        <div
          className="relative flex-1 min-h-0"
          style={{
            minHeight: 360,
            background: "var(--bg-app)",
          }}
        >
          {doc.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.previewUrl}
              alt={doc.typeLabel}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
            />
          ) : (
            <div className="relative w-full h-full" style={{ minHeight: 360 }}>
              <DocMockSurface kind={doc.kind} sharp />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function ReadField({
  label,
  value,
  full,
  valueStyle,
}: {
  label: string;
  value: string | undefined | null;
  full?: boolean;
  /** Estilo extra no valor (ex.: financeiro mais grosso) */
  valueStyle?: CSSProperties;
}) {
  return (
    <label
      style={{
        ...fieldShell,
        ...(full ? { gridColumn: "1 / -1" } : null),
      }}
    >
      <span style={labelStyle}>{label}</span>
      <input
        type="text"
        readOnly
        value={value?.trim() ? value : "—"}
        className={valueStyle ? "tabular" : undefined}
        style={{ ...inputStyle, ...valueStyle }}
        tabIndex={0}
      />
    </label>
  );
}

/** Ícone oficial-style do WhatsApp (SVG) */
function WhatsAppIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.85 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function phoneToWhatsAppUrl(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  // BR: se não tiver código do país, assume 55
  const withCountry =
    digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

/** Campo Número + botão WhatsApp (colado ao número) */
function PhoneField({ phone }: { phone: string }) {
  const wa = phoneToWhatsAppUrl(phone);
  return (
    <div style={fieldShell}>
      <span style={labelStyle}>Número</span>
      <div className="flex items-center min-w-0" style={{ gap: 0 }}>
        <input
          type="text"
          readOnly
          value={phone?.trim() ? phone : "—"}
          className="tabular min-w-0"
          style={{
            ...inputStyle,
            width: "auto",
            flex: "0 1 auto",
            maxWidth: "100%",
          }}
          tabIndex={0}
          size={Math.max((phone?.trim() || "—").length, 10)}
        />
        <a
          href={wa ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir WhatsApp"
          title="WhatsApp"
          onClick={(e) => {
            if (!wa) e.preventDefault();
          }}
          className="flex items-center justify-center shrink-0 transition-opacity hover:opacity-90"
          style={{
            width: 40,
            height: 40,
            marginLeft: -6,
            borderRadius: "var(--radius-md)",
            background: wa ? "#25D366" : "var(--bg-card)",
            color: wa ? "#ffffff" : "var(--text-3)",
            pointerEvents: wa ? "auto" : "none",
            opacity: wa ? 1 : 0.45,
          }}
        >
          <WhatsAppIcon size={20} />
        </a>
      </div>
    </div>
  );
}

/** Valores financeiros: um pouco mais grosso e legível */
const moneyValueStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: 15,
  color: "var(--text-1)",
};

function EditField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <label style={fieldShell}>
      <span style={labelStyle}>{label}</span>
      <span className="flex items-center gap-1.5 min-w-0">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="tabular min-w-0 flex-1"
          style={inputStyle}
        />
        {suffix ? (
          <span style={{ fontSize: 12, color: "var(--text-3)", flexShrink: 0 }}>
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/** Switch Ativar/Desativar (mesmo padrão dos adquirentes) */
function ToggleSwitch({
  on,
  onToggle,
  ariaLabel,
}: {
  on: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onToggle}
      className="relative shrink-0 transition-colors"
      style={{
        width: 46,
        height: 26,
        borderRadius: 999,
        border: "none",
        padding: 0,
        cursor: "pointer",
        /* Ativo: branco · Off: mesmo fundo dos cards (--bg-elevated) */
        background: on ? "#ffffff" : "var(--bg-elevated)",
        boxShadow: on ? "none" : "inset 0 0 0 1px var(--border-card)",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          /* Ativo: bolinha = fundo do card · Off: bolinha branca */
          background: on ? "var(--bg-card)" : "#ffffff",
          transition: "left 0.18s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
        }}
      />
    </button>
  );
}

export function AdminUserDetailModal({
  user,
  open,
  onClose,
  onStatusChange,
  onSaveFees,
  onSaveDocs,
  onSaveRouting,
  initialTab = "dados",
}: AdminUserDetailModalProps) {
  const router = useRouter();
  const titleId = useId();
  const [tab, setTab] = useState<DetailTab>(initialTab);
  const [viewingDoc, setViewingDoc] = useState<DocPreviewItem | null>(null);
  const [fees, setFees] = useState<SellerFees>({ ...DEFAULT_SELLER_FEES });
  const [enabledAcqIds, setEnabledAcqIds] = useState<string[]>([]);
  /** Overrides de status dos docs (Ativar aprova todos) */
  const [docStatusMap, setDocStatusMap] = useState<DocStatusMap | null>(null);
  const [saqueAutomatico, setSaqueAutomatico] = useState(false);

  // Reset ao abrir / trocar de seller (não ao só mudar status da conta)
  useEffect(() => {
    if (!open || !user) {
      setTab("dados");
      setViewingDoc(null);
      setDocStatusMap(null);
      return;
    }
    setTab(initialTab);
    setViewingDoc(null);
    setDocStatusMap(null);
    setFees({ ...DEFAULT_SELLER_FEES, ...user.fees });
    setEnabledAcqIds(
      user.adquirenteIds?.length
        ? [...user.adquirenteIds]
        : adquirentesMock.filter((a) => a.status === "ativo").map((a) => a.id)
    );
    setSaqueAutomatico(!!user.saqueAutomatico);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reabre por user.id
  }, [open, user?.id, initialTab]);

  useEffect(() => {
    if (!open) return;
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

  const docPreviews = useMemo(() => {
    if (!user) return [];
    const base = getSellerDocPreviews(user);
    if (!docStatusMap) return base;
    return base.map((d) => ({
      ...d,
      status: docStatusMap[d.kind] ?? d.status,
    }));
  }, [user, docStatusMap]);

  if (!open || !user) return null;

  const isPJ = user.personType === "pj";

  function parseNum(v: string): number {
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  /** Aprova todos os documentos exigidos da conta */
  function approveAllDocs() {
    if (!user) return;
    const base = getSellerDocPreviews(user);
    const next: DocStatusMap = {};
    for (const d of base) {
      next[d.kind] = "aprovado";
    }
    setDocStatusMap(next);
    setViewingDoc((cur) =>
      cur ? { ...cur, status: "aprovado" } : cur
    );
    void onSaveDocs?.(user.id, "aprovado");
    onStatusChange?.(user.id, "ativo");
  }

  /** Volta todos os docs para em análise */
  function reviewAllDocs() {
    if (!user) return;
    const base = getSellerDocPreviews(user);
    const next: DocStatusMap = {};
    for (const d of base) {
      next[d.kind] = "pendente";
    }
    setDocStatusMap(next);
    setViewingDoc((cur) =>
      cur ? { ...cur, status: "pendente" } : cur
    );
    void onSaveDocs?.(user.id, "pendente");
    onStatusChange?.(user.id, "pendente");
  }

  function toggleAcq(id: string) {
    setEnabledAcqIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      if (user) {
        void onSaveRouting?.(user.id, { adquirenteIds: next });
      }
      return next;
    });
  }

  function toggleSaqueAutomatico() {
    setSaqueAutomatico((prev) => {
      const next = !prev;
      if (user) {
        void onSaveRouting?.(user.id, { saqueAutomatico: next });
      }
      return next;
    });
  }

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
          maxWidth: 760,
          maxHeight: "min(90vh, 860px)",
          borderRadius: "var(--radius-card)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        {/* X no canto superior direito */}
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

        {/* Foto → nome → ID */}
        <div
          className="relative flex flex-col items-center text-center shrink-0"
          style={{ padding: "0 24px 14px" }}
        >
          <span
            className="flex items-center justify-center overflow-hidden font-bold shrink-0"
            style={{
              width: 88,
              height: 88,
              borderRadius: "var(--radius-full)",
              background: "var(--bg-elevated)",
              color: "var(--green-use)",
              fontSize: 26,
              letterSpacing: "0.02em",
              boxShadow: "0 0 0 1px var(--border-card)",
              marginBottom: 12,
            }}
            aria-hidden
          >
            {initials(user.name)}
          </span>

          {/* Nome + status lado a lado (Ativo verde · Pendente amarelo · Bloqueado vermelho) */}
          <div
            className="inline-flex items-center justify-center flex-wrap"
            style={{ gap: 10 }}
          >
            <h2
              id={titleId}
              className="font-bold"
              style={{
                fontSize: 20,
                color: "var(--text-1)",
                margin: 0,
                lineHeight: 1.25,
              }}
            >
              {user.name}
            </h2>
            <span
              className="inline-flex items-center justify-center font-semibold shrink-0"
              style={{
                height: 24,
                padding: "0 9px",
                borderRadius: 8,
                ...statusBadgeColors(user.status),
                fontSize: 11,
                lineHeight: 1,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}
            >
              {statusLabel(user.status)}
            </span>
          </div>
          <p
            className="tabular"
            style={{
              fontSize: 12,
              color: "var(--text-3)",
              margin: "6px 0 0",
            }}
          >
            ID {user.id}
          </p>
        </div>

        {/* Abas (card) + saque automático fora, ao lado de Adquirentes */}
        <div
          className="flex items-center justify-center shrink-0 flex-wrap"
          style={{ padding: "0 24px 16px", minHeight: 46, gap: 12 }}
        >
          <div
            className="inline-flex items-center"
            style={{
              padding: 4,
              borderRadius: "var(--radius-md)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-card)",
              gap: 2,
            }}
            role="tablist"
            aria-label="Detalhes do seller"
          >
            {(
              [
                ["dados", "Informações"],
                ["documentos", "Documentos"],
                ["taxas", "Taxas"],
                ["adquirentes", "Adquirentes"],
              ] as const
            ).map(([id, label]) => {
              const on = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(id)}
                  style={{
                    height: 34,
                    padding: "0 14px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13.5,
                    fontWeight: on ? 650 : 500,
                    background: on ? "var(--bg-card)" : "transparent",
                    color: on ? "var(--text-1)" : "var(--text-2)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Saque automático + acessar dashboard do seller */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <ToggleSwitch
                on={saqueAutomatico}
                onToggle={toggleSaqueAutomatico}
                ariaLabel={
                  saqueAutomatico
                    ? "Desativar saque automático"
                    : "Ativar saque automático"
                }
              />
              <span
                className="font-medium text-left"
                style={{
                  fontSize: 12,
                  color: "var(--text-2)",
                  whiteSpace: "nowrap",
                  lineHeight: 1.25,
                }}
              >
                Saque
                <br />
                automático
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!user) return;
                try {
                  localStorage.setItem(
                    "darkpay.impersonate.seller",
                    JSON.stringify({
                      id: user.id,
                      name: user.name,
                      email: user.email,
                      at: new Date().toISOString(),
                    })
                  );
                } catch {
                  /* ignore */
                }
                onClose();
                router.push("/");
              }}
              className="inline-flex items-center justify-center gap-1.5 font-semibold transition-opacity hover:opacity-90"
              style={{
                height: 34,
                padding: "0 12px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: "#ffffff",
                color: "#0a0f0c",
                fontSize: 12.5,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
              title={`Abrir dashboard de ${user.name}`}
            >
              <ExternalLink size={14} strokeWidth={2.25} aria-hidden />
              Dashboard
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto min-h-0"
          style={{ padding: "4px 24px 22px" }}
        >
          {tab === "dados" ? (
            <div className="flex flex-col" style={{ gap: 20 }}>
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                }}
              >
                <ReadField label="Nome" value={user.name} />
                <ReadField
                  label="Nome de exibição"
                  value={user.displayName}
                />
                <ReadField label="E-mail" value={user.email} />
                <PhoneField phone={user.phone} />
                <ReadField label="CPF" value={user.document} />
                <ReadField
                  label="Data de cadastro"
                  value={formatDateTime(user.createdAt)}
                />
                <ReadField label="Razão social" value={user.company} />
                <ReadField label="CNPJ" value={user.cnpj} />
                <ReadField label="Endereço" value={user.address} full />
                <ReadField label="Cidade" value={user.city} />
                <ReadField label="Estado" value={user.state} />
                <ReadField label="CEP" value={user.zip} />
              </div>

              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                }}
              >
                <ReadField
                  label="Saldo disponível"
                  value={formatBRL(user.balance)}
                  valueStyle={moneyValueStyle}
                />
                <ReadField
                  label="Saldo retido"
                  value={formatBRL(user.heldBalance ?? 0)}
                  valueStyle={{
                    ...moneyValueStyle,
                    color:
                      (user.heldBalance ?? 0) > 0
                        ? "#f5a623"
                        : moneyValueStyle.color,
                  }}
                />
                <ReadField
                  label="Volume movimentado"
                  value={formatBRL(user.volumeTotal)}
                  valueStyle={moneyValueStyle}
                />
                <label style={fieldShell}>
                  <span style={labelStyle}>Lucro da plataforma</span>
                  <input
                    type="text"
                    readOnly
                    className="tabular"
                    value={formatBRL(
                      user.platformProfit > 0
                        ? user.platformProfit
                        : user.volumeTotal * 0.03
                    )}
                    style={{
                      ...inputStyle,
                      ...moneyValueStyle,
                      color: "#22c55e",
                    }}
                  />
                </label>
              </div>
            </div>
          ) : null}

          {tab === "documentos" ? (
            <div className="flex flex-col" style={{ gap: 14 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: "var(--text-3)",
                  textAlign: "center",
                }}
              >
                {isPJ
                  ? "Conta PJ — frente, verso, selfie e contrato social"
                  : "Conta CPF — selfie, documento frente e verso"}
              </p>

              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns:
                    docPreviews.length >= 4
                      ? "repeat(2, minmax(0, 1fr))"
                      : "repeat(3, minmax(0, 1fr))",
                }}
              >
                {docPreviews.map((doc) => {
                  const badge = resolveDocBadge(user.status, doc.status);
                  return (
                    <div
                      key={doc.kind}
                      className="flex flex-col min-w-0"
                      style={{
                        borderRadius: "var(--radius-card)",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-card)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        className="relative"
                        style={{
                          aspectRatio: "4 / 3",
                          minHeight: 148,
                          overflow: "hidden",
                          background: "var(--bg-app)",
                          borderRadius:
                            "var(--radius-card) var(--radius-card) 0 0",
                        }}
                      >
                        {doc.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={doc.previewUrl}
                            alt=""
                            aria-hidden
                            style={{
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              filter: "blur(8px) brightness(0.7)",
                              transform: "scale(1.08)",
                            }}
                          />
                        ) : (
                          <DocMockSurface kind={doc.kind} />
                        )}

                        <div
                          aria-hidden
                          style={{
                            position: "absolute",
                            inset: 0,
                            background:
                              "linear-gradient(180deg, rgba(12,14,18,0.35) 0%, rgba(12,14,18,0.55) 100%)",
                            backdropFilter: "blur(1px)",
                          }}
                        />

                        <div
                          className="absolute inset-0 flex items-center justify-center"
                          style={{ zIndex: 1 }}
                        >
                          <button
                            type="button"
                            onClick={() => setViewingDoc(doc)}
                            className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
                            style={{
                              height: 36,
                              padding: "0 18px",
                              borderRadius: "var(--radius-md)",
                              border: "none",
                              background: "#ffffff",
                              color: "#0a0f0c",
                              fontSize: 13,
                              cursor: "pointer",
                              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                            }}
                          >
                            Visualizar
                          </button>
                        </div>

                        <span
                          className="absolute inline-flex items-center justify-center font-semibold"
                          style={{
                            top: 8,
                            right: 8,
                            zIndex: 2,
                            height: 20,
                            padding: "0 7px",
                            borderRadius: 7,
                            fontSize: 10,
                            lineHeight: 1,
                            letterSpacing: "0.01em",
                            whiteSpace: "nowrap",
                            background: badge.background,
                            color: badge.color,
                            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                          }}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div style={{ padding: "10px 12px 12px" }}>
                        <p
                          className="font-semibold truncate"
                          style={{
                            margin: 0,
                            fontSize: 13,
                            color: "var(--text-1)",
                          }}
                        >
                          {doc.typeLabel}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {tab === "taxas" ? (
            <div className="flex flex-col" style={{ gap: 16 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: "var(--text-3)",
                  lineHeight: 1.4,
                }}
              >
                Personalize as taxas desta conta. MDR na liquidação das vendas e
                taxa cobrada em saques.
              </p>

              <div>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-3)",
                  }}
                >
                  MDR (vendas / Pix)
                </p>
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <EditField
                    label="Percentual"
                    value={String(fees.mdrPercent)}
                    onChange={(v) =>
                      setFees((f) => ({ ...f, mdrPercent: parseNum(v) }))
                    }
                    suffix="%"
                  />
                  <EditField
                    label="Fixo por transação"
                    value={String(fees.mdrFixed)}
                    onChange={(v) =>
                      setFees((f) => ({ ...f, mdrFixed: parseNum(v) }))
                    }
                    suffix="R$"
                  />
                </div>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-3)",
                  }}
                >
                  Taxa de saque
                </p>
                <div
                  className="grid gap-3"
                  style={{
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <EditField
                    label="Percentual"
                    value={String(fees.saquePercent)}
                    onChange={(v) =>
                      setFees((f) => ({ ...f, saquePercent: parseNum(v) }))
                    }
                    suffix="%"
                  />
                  <EditField
                    label="Fixo por saque"
                    value={String(fees.saqueFixed)}
                    onChange={(v) =>
                      setFees((f) => ({ ...f, saqueFixed: parseNum(v) }))
                    }
                    suffix="R$"
                  />
                </div>
              </div>

              <div
                style={{
                  ...fieldShell,
                  minHeight: "auto",
                }}
              >
                <span style={labelStyle}>Resumo</span>
                <p
                  className="tabular"
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text-1)",
                  }}
                >
                  MDR {fees.mdrPercent.toFixed(2)}% + {formatBRL(fees.mdrFixed)}
                  {" · "}
                  Saque {fees.saquePercent.toFixed(2)}% +{" "}
                  {formatBRL(fees.saqueFixed)}
                </p>
              </div>
            </div>
          ) : null}

          {tab === "adquirentes" ? (
            <div className="flex flex-col" style={{ gap: 8 }}>
              {adquirentesMock.map((acq) => {
                const on = enabledAcqIds.includes(acq.id);
                return (
                  <div
                    key={acq.id}
                    className="flex items-center gap-3 w-full"
                    style={{
                      ...fieldShell,
                      flexDirection: "row",
                      alignItems: "center",
                      minHeight: 52,
                    }}
                  >
                    <ToggleSwitch
                      on={on}
                      onToggle={() => toggleAcq(acq.id)}
                      ariaLabel={
                        on
                          ? `Desativar ${acq.name}`
                          : `Ativar ${acq.name}`
                      }
                    />
                    <span
                      className="font-medium truncate min-w-0 flex-1"
                      style={{ fontSize: 14, color: "var(--text-1)" }}
                    >
                      {acq.name}
                    </span>
                    {acq.priority === 1 ? (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#0a0f0c",
                          background: "#ffffff",
                          borderRadius: 8,
                          padding: "2px 7px",
                          flexShrink: 0,
                        }}
                      >
                        Principal
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/*
          Footer:
          · Documentos → Ativar / Revisar / Bloquear + Fechar
          · Taxas → Salvar
          · demais → Fechar
        */}
        <div
          className="flex flex-wrap items-center justify-end gap-2.5 shrink-0"
          style={{ padding: "8px 24px 20px", position: "relative", zIndex: 2 }}
        >
          {tab === "documentos" ? (
            <>
              {user.status === "bloqueado" || user.status === "pendente" ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    approveAllDocs();
                  }}
                  className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
                  style={{
                    height: 38,
                    padding: "0 18px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "#ffffff",
                    color: "#0a0f0c",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Ativar
                </button>
              ) : null}

              {user.status === "ativo" ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    reviewAllDocs();
                  }}
                  className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
                  style={{
                    height: 38,
                    padding: "0 18px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "#eab308",
                    color: "#0a0f0c",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Revisar
                </button>
              ) : null}

              {user.status === "ativo" || user.status === "pendente" ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange?.(user.id, "bloqueado");
                  }}
                  className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
                  style={{
                    height: 38,
                    padding: "0 18px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "#ef4444",
                    color: "#ffffff",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Bloquear
                </button>
              ) : null}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
                style={{
                  height: 38,
                  padding: "0 18px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-muted)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-1)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Fechar
              </button>
            </>
          ) : tab === "taxas" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (user) void onSaveFees?.(user.id, fees);
                onClose();
              }}
              className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
              style={{
                height: 38,
                padding: "0 18px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: "#ffffff",
                color: "#0a0f0c",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Salvar
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
              style={{
                height: 38,
                padding: "0 18px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-muted)",
                background: "var(--bg-elevated)",
                color: "var(--text-1)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Fechar
            </button>
          )}
        </div>
      </div>

      {/* Lightbox do documento */}
      {viewingDoc ? (
        <DocViewerLightbox
          doc={viewingDoc}
          onClose={() => setViewingDoc(null)}
        />
      ) : null}
    </div>
  );
}
