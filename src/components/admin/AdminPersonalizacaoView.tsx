"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { useBranding } from "@/components/branding/BrandingProvider";
import {
  cloneDefaultBranding,
  createBanner,
  DEFAULT_BRANDING,
  fileToDataUrl,
  type BrandBanner,
  type PlatformBranding,
} from "@/lib/branding";

/** Modal: criar ou editar banner (imagem + nome + link) */
type BannerModalState =
  | { mode: "create"; imageUrl: string }
  | { mode: "edit"; index: number; banner: BrandBanner };

const ACCEPT_IMG = "image/png,image/jpeg,image/webp,image/svg+xml";
const ACCEPT_FAVICON =
  "image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/jpeg,image/webp";
const ACCEPT_BANNER = "image/png,image/jpeg,image/webp";

const btnPrimary: CSSProperties = {
  height: 42,
  padding: "0 22px",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "#ffffff",
  color: "#0a0f0c",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
};

/** Cancelar / secundário — mesmo padrão dos outros modais (Webhooks, Gerentes…) */
const btnGhost: CSSProperties = {
  height: 42,
  padding: "0 18px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-muted)",
  background: "var(--bg-elevated)",
  color: "var(--text-1)",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
};

const btnChip: CSSProperties = {
  height: 28,
  padding: "0 10px",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "#ffffff",
  color: "#0a0f0c",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

function fingerprint(b: PlatformBranding): string {
  const banners = b.banners
    .map((x) => `${x.id}|${x.imageUrl}|${x.name}|${x.linkUrl}`)
    .join("||");
  return [b.logoUrl, b.faviconUrl, b.authImageUrl, banners].join("|");
}

const fieldInput: CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-card)",
  background: "var(--bg-elevated)",
  color: "var(--text-1)",
  fontSize: 13,
  fontWeight: 500,
  outline: "none",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export function AdminPersonalizacaoView() {
  const { branding, resetBranding, setBranding } = useBranding();
  const [draft, setDraft] = useState<PlatformBranding>(branding);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerModal, setBannerModal] = useState<BannerModalState | null>(
    null
  );
  const formId = useId();

  useEffect(() => {
    setDraft({
      ...branding,
      banners: branding.banners.map((b) => ({ ...b })),
    });
  }, [branding]);

  const dirty = fingerprint(branding) !== fingerprint(draft);
  const multi = draft.banners.length > 1;

  async function readImage(
    file: File | null,
    maxBytes: number
  ): Promise<string | null> {
    setError(null);
    if (!file) return null;
    if (!file.type.startsWith("image/")) {
      setError("Envie apenas arquivos de imagem.");
      return null;
    }
    if (file.size > maxBytes) {
      setError("Arquivo muito grande (máx. 2,5 MB por imagem).");
      return null;
    }
    try {
      return await fileToDataUrl(file);
    } catch {
      setError("Não foi possível ler o arquivo.");
      return null;
    }
  }

  async function setSingle(
    key: "logoUrl" | "faviconUrl" | "authImageUrl",
    file: File | null,
    maxBytes: number
  ) {
    const url = await readImage(file, maxBytes);
    if (!url) return;
    setDraft((prev) => ({ ...prev, [key]: url }));
  }

  /** Abre popup de novo banner (opcionalmente já com imagem do arraste) */
  async function openCreateBanner(file?: File | null) {
    if (file) {
      const url = await readImage(file, 2.5 * 1024 * 1024);
      if (!url) return;
      setBannerModal({ mode: "create", imageUrl: url });
      return;
    }
    setBannerModal({ mode: "create", imageUrl: "" });
  }

  function openEditBanner(index: number) {
    const banner = draft.banners[index];
    if (!banner) return;
    setBannerModal({
      mode: "edit",
      index,
      banner: { ...banner },
    });
  }

  function commitBannerModal(data: {
    imageUrl: string;
    name: string;
    linkUrl: string;
  }) {
    if (bannerModal?.mode === "create") {
      const n = draft.banners.length + 1;
      const banner = createBanner({
        imageUrl: data.imageUrl,
        name: data.name.trim() || `Banner ${n}`,
        linkUrl: data.linkUrl.trim(),
      });
      setDraft((prev) => ({
        ...prev,
        banners: [...prev.banners, banner],
      }));
    } else if (bannerModal?.mode === "edit") {
      const { index } = bannerModal;
      setDraft((prev) => {
        const next = prev.banners.map((b, i) =>
          i === index
            ? {
                ...b,
                imageUrl: data.imageUrl,
                name: data.name.trim() || b.name,
                linkUrl: data.linkUrl.trim(),
              }
            : b
        );
        return { ...prev, banners: next };
      });
    }
    setBannerModal(null);
  }

  function removeBanner(index: number) {
    setDraft((prev) => ({
      ...prev,
      banners: prev.banners.filter((_, i) => i !== index),
    }));
  }

  /** Reordena banners (arrastar e soltar na grade) */
  function moveBanner(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    setDraft((prev) => {
      if (fromIndex >= prev.banners.length || toIndex >= prev.banners.length) {
        return prev;
      }
      const next = [...prev.banners];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return { ...prev, banners: next };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...draft,
        banners:
          draft.banners.length > 0
            ? draft.banners
            : cloneDefaultBranding().banners,
      };
      // local + UI imediato
      setBranding(payload);
      // MySQL / API
      try {
        await fetch("/api/v1/branding", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        /* offline — localStorage já salvo */
      }
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      setError("Não foi possível salvar. Use imagens menores.");
    } finally {
      setSaving(false);
    }
  }

  function handleResetAll() {
    setDraft(cloneDefaultBranding());
    resetBranding();
    setError(null);
  }

  return (
    <div className="flex flex-col w-full min-w-0" style={{ gap: 16 }}>
      <BannerConfigModal
        open={!!bannerModal}
        mode={bannerModal?.mode ?? "create"}
        initialImageUrl={
          bannerModal?.mode === "create"
            ? bannerModal.imageUrl
            : bannerModal?.mode === "edit"
              ? bannerModal.banner.imageUrl
              : ""
        }
        initialName={
          bannerModal?.mode === "edit" ? bannerModal.banner.name : ""
        }
        initialLinkUrl={
          bannerModal?.mode === "edit" ? bannerModal.banner.linkUrl : ""
        }
        defaultName={
          bannerModal?.mode === "edit"
            ? `Banner ${bannerModal.index + 1}`
            : `Banner ${draft.banners.length + 1}`
        }
        onClose={() => setBannerModal(null)}
        onConfirm={commitBannerModal}
        readImage={readImage}
      />

      {/* ── 1. Identidade + auth ── */}
      <Panel
        kicker="01"
        title="Identidade visual"
        subtitle="Logo, ícone e imagem de login · registro · esqueci senha"
      >
        <div
          className="grid w-full"
          style={{
            gap: 16,
            /* Logo · Ícone (quadrado) · Login/registro (preview maior) */
            gridTemplateColumns: "minmax(0, 1.15fr) 132px minmax(0, 1.35fr)",
            alignItems: "start",
          }}
        >
          <UploadTile
            formId={`${formId}-logo`}
            label="Logo"
            caption="Sidebar e formulários"
            url={draft.logoUrl}
            accept={ACCEPT_IMG}
            fit="contain"
            shape="logo"
            onFile={(f) => setSingle("logoUrl", f, 2.5 * 1024 * 1024)}
          />
          <UploadTile
            formId={`${formId}-favicon`}
            label="Ícone"
            caption="Favicon"
            url={draft.faviconUrl}
            accept={ACCEPT_FAVICON}
            fit="contain"
            shape="square"
            onFile={(f) => setSingle("faviconUrl", f, 1 * 1024 * 1024)}
          />
          <UploadTile
            formId={`${formId}-auth`}
            label="Login / registro"
            caption="Esqueci senha · nova senha"
            url={draft.authImageUrl}
            accept={ACCEPT_BANNER}
            fit="cover"
            shape="auth"
            onFile={(f) => setSingle("authImageUrl", f, 2.5 * 1024 * 1024)}
          />
        </div>
      </Panel>

      {/* ── 2. Banners ── */}
      <Panel
        kicker="02"
        title="Banners"
        subtitle={
          multi
            ? `${draft.banners.length} imagens · carrossel · arraste para reordenar`
            : "Dashboard do seller · arraste para ordenar · adicione mais para carrossel"
        }
        action={
          <button
            type="button"
            onClick={() => openCreateBanner()}
            style={{
              ...btnPrimary,
              height: 36,
              padding: "0 14px",
              fontSize: 12.5,
              borderRadius: "var(--radius-md)",
            }}
          >
            Adicionar banner
          </button>
        }
      >
        <div
          className="grid w-full"
          style={{
            gap: 14,
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          }}
        >
          {draft.banners.map((banner, index) => (
            <BannerThumb
              key={banner.id}
              banner={banner}
              index={index}
              onOpen={() => openEditBanner(index)}
              onRemove={() => removeBanner(index)}
              onMove={moveBanner}
            />
          ))}
          <AddSlot
            formId={`${formId}-banner-slot`}
            accept={ACCEPT_BANNER}
            shape="wide"
            onClick={() => openCreateBanner()}
            onFile={(f) => openCreateBanner(f)}
          />
        </div>
      </Panel>

      {error ? (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 13,
            color: "#ef4444",
            textAlign: "center",
          }}
        >
          {error}
        </p>
      ) : null}

      {/* Ações */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleResetAll}
          style={{ ...btnGhost, borderRadius: "var(--radius-md)" }}
        >
          Restaurar tudo
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{
            ...btnPrimary,
            borderRadius: "var(--radius-md)",
            cursor: saving || !dirty ? "not-allowed" : "pointer",
            opacity: saving || !dirty ? 0.45 : 1,
          }}
        >
          {savedFlash ? "Salvo!" : saving ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════ building blocks ═══════════════════ */

function Panel({
  kicker,
  title,
  subtitle,
  action,
  children,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="surface-card w-full min-w-0 overflow-hidden"
      style={{ borderRadius: "var(--radius-card)" }}
    >
      <div
        className="flex flex-wrap items-start justify-between gap-3"
        style={{
          padding: "18px 20px",
          borderBottom: "1px solid var(--border-card)",
        }}
      >
        <div className="min-w-0 flex items-start gap-2.5">
          <span
            className="shrink-0 tabular font-bold"
            style={{
              color: "var(--text-3)",
              fontSize: 13,
              lineHeight: "22px",
              letterSpacing: "0.02em",
              paddingTop: 1,
            }}
          >
            {kicker}
          </span>
          <div className="min-w-0">
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: "var(--text-1)",
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h2>
            <p
              style={{
                margin: "5px 0 0",
                fontSize: 13,
                color: "var(--text-2)",
                lineHeight: 1.45,
              }}
            >
              {subtitle}
            </p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </section>
  );
}

type TileShape = "square" | "wide" | "tall" | "auth" | "logo";

/** Altura alinhada ao ícone quadrado (132px) na grade de identidade */
const IDENTITY_PREVIEW_H = 132;

function tileBoxStyle(shape: TileShape): CSSProperties {
  if (shape === "square") {
    return {
      aspectRatio: "1 / 1",
      width: "100%",
      height: "auto",
      minHeight: IDENTITY_PREVIEW_H,
    };
  }
  if (shape === "auth" || shape === "logo") {
    /* Logo + login/registro: mesma altura do ícone, preview maior */
    return {
      width: "100%",
      height: IDENTITY_PREVIEW_H,
      minHeight: IDENTITY_PREVIEW_H,
    };
  }
  if (shape === "tall") {
    return { width: "100%", height: 168 };
  }
  // wide — banners da dashboard (faixa baixa)
  return { width: "100%", height: 72 };
}

/**
 * Miniatura na grade:
 * - arrastar para reordenar
 * - clique abre popup
 * - Remover sempre visível
 */
function BannerThumb({
  banner,
  index,
  onOpen,
  onRemove,
  onMove,
}: {
  banner: BrandBanner;
  index: number;
  onOpen: () => void;
  onRemove: () => void;
  onMove: (from: number, to: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState(false);
  const dragStarted = useRef(false);

  return (
    <div
      className="relative w-full"
      draggable
      onDragStart={(e) => {
        dragStarted.current = true;
        setDragging(true);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        // Firefox precisa de data
        e.dataTransfer.setData("application/x-banner-index", String(index));
      }}
      onDragEnd={() => {
        setDragging(false);
        setOver(false);
        // delay para não disparar click após soltar
        window.setTimeout(() => {
          dragStarted.current = false;
        }, 40);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const raw =
          e.dataTransfer.getData("application/x-banner-index") ||
          e.dataTransfer.getData("text/plain");
        const from = Number(raw);
        if (!Number.isFinite(from)) return;
        onMove(from, index);
      }}
      style={{
        opacity: dragging ? 0.55 : 1,
        outline: over ? "1px solid #ffffff" : "none",
        outlineOffset: 2,
        borderRadius: "var(--radius-card)",
        transition: "opacity 120ms ease",
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (dragStarted.current) return;
          onOpen();
        }}
        className="w-full overflow-hidden flex items-center justify-center"
        style={{
          ...tileBoxStyle("wide"),
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--border-card)",
          background: "var(--bg-elevated)",
          cursor: "grab",
          padding: 0,
        }}
        title="Arraste para reordenar · clique para editar"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={banner.imageUrl}
          alt={banner.name || ""}
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            borderRadius: "var(--radius-card)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{
          ...btnChip,
          position: "absolute",
          top: 8,
          right: 8,
        }}
      >
        Remover
      </button>
    </div>
  );
}

/** Popup: imagem + nome + link */
function BannerConfigModal({
  open,
  mode,
  initialImageUrl,
  initialName,
  initialLinkUrl,
  defaultName,
  onClose,
  onConfirm,
  readImage,
}: {
  open: boolean;
  mode: "create" | "edit";
  initialImageUrl: string;
  initialName: string;
  initialLinkUrl: string;
  defaultName: string;
  onClose: () => void;
  onConfirm: (data: {
    imageUrl: string;
    name: string;
    linkUrl: string;
  }) => void;
  readImage: (file: File | null, maxBytes: number) => Promise<string | null>;
}) {
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [name, setName] = useState(initialName);
  const [linkUrl, setLinkUrl] = useState(initialLinkUrl);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setImageUrl(initialImageUrl);
    setName(initialName);
    setLinkUrl(initialLinkUrl);
    setLocalError(null);
  }, [open, initialImageUrl, initialName, initialLinkUrl]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  async function takeFile(file: File | null | undefined) {
    if (!file) return;
    const url = await readImage(file, 2.5 * 1024 * 1024);
    if (!url) {
      setLocalError("Não foi possível ler a imagem.");
      return;
    }
    setLocalError(null);
    setImageUrl(url);
  }

  function handleConfirm() {
    if (!imageUrl.trim()) {
      setLocalError("Envie uma imagem do banner.");
      return;
    }
    onConfirm({
      imageUrl,
      name: name.trim() || defaultName,
      linkUrl: linkUrl.trim(),
    });
  }

  if (!open) return null;

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
        style={{
          maxWidth: 440,
          borderRadius: "var(--radius-card)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          overflow: "hidden",
          zIndex: 1,
        }}
      >
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            padding: "18px 18px 12px",
            borderBottom: "1px solid var(--border-card)",
          }}
        >
          <h2
            id={titleId}
            className="font-bold"
            style={{ margin: 0, fontSize: 17, color: "var(--text-1)" }}
          >
            {mode === "create" ? "Novo banner" : "Editar banner"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex items-center justify-center"
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
            <X size={18} />
          </button>
        </div>

        <div
          className="flex flex-col"
          style={{ padding: "16px 18px 18px", gap: 14 }}
        >
          {/* Imagem */}
          <div className="flex flex-col" style={{ gap: 8 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-2)",
              }}
            >
              Imagem
            </span>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_BANNER}
              className="hidden"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                void takeFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e: DragEvent) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                setDragOver(false);
                void takeFile(e.dataTransfer.files?.[0]);
              }}
              className="w-full overflow-hidden flex items-center justify-center"
              style={{
                height: 120,
                borderRadius: "var(--radius-card)",
                border: dragOver
                  ? "1px solid #ffffff"
                  : "1px solid var(--border-card)",
                background: "var(--bg-elevated)",
                cursor: "pointer",
                padding: imageUrl ? 0 : 16,
              }}
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-2)",
                    textAlign: "center",
                  }}
                >
                  Clique ou arraste a imagem
                </span>
              )}
            </button>
          </div>

          <label className="flex flex-col" style={{ gap: 6 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-2)",
              }}
            >
              Nome
            </span>
            <input
              type="text"
              value={name}
              placeholder={defaultName}
              onChange={(e) => setName(e.target.value)}
              style={fieldInput}
            />
          </label>

          <label className="flex flex-col" style={{ gap: 6 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-2)",
              }}
            >
              Link ao clicar
            </span>
            <input
              type="url"
              value={linkUrl}
              placeholder="https://… ou /caminho"
              onChange={(e) => setLinkUrl(e.target.value)}
              style={fieldInput}
            />
          </label>

          {localError ? (
            <p
              role="alert"
              style={{ margin: 0, fontSize: 13, color: "#ef4444" }}
            >
              {localError}
            </p>
          ) : null}

          <div
            className="flex flex-wrap items-center justify-end gap-2"
            style={{ marginTop: 4 }}
          >
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90"
              style={{ ...btnGhost, height: 40 }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                ...btnPrimary,
                height: 40,
                borderRadius: "var(--radius-md)",
              }}
            >
              {mode === "create" ? "Adicionar" : "Salvar banner"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tile de upload — clique ou arraste, cantos radius-card */
function UploadTile({
  formId,
  label,
  caption,
  url,
  accept,
  fit,
  shape = "wide",
  onFile,
  onRemove,
}: {
  formId: string;
  label: string;
  caption: string;
  url: string;
  accept: string;
  fit: "cover" | "contain";
  shape?: TileShape;
  onFile: (file: File | null) => void;
  onRemove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function take(f: File | null | undefined) {
    if (!f) return;
    onFile(f);
  }

  /* Padding só em contain (logo / ícone) para não colar na borda */
  const pad = fit === "contain" ? (shape === "square" ? 12 : 14) : 0;

  return (
    <div className="flex flex-col min-w-0" style={{ gap: 10 }}>
      <div className="relative w-full">
        <input
          ref={inputRef}
          id={formId}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e: DragEvent) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            take(e.dataTransfer.files?.[0]);
          }}
          className="w-full overflow-hidden flex items-center justify-center"
          style={{
            ...tileBoxStyle(shape),
            borderRadius: "var(--radius-card)",
            border: dragOver
              ? "1px solid #ffffff"
              : "1px solid var(--border-card)",
            background: "var(--bg-elevated)",
            boxShadow: dragOver
              ? "0 0 0 3px rgba(255,255,255,0.08)"
              : "none",
            cursor: "pointer",
            padding: pad,
            boxSizing: "border-box",
            transition: "border-color 140ms ease, box-shadow 140ms ease",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            style={{
              width: "100%",
              height: "100%",
              objectFit: fit,
              objectPosition: "center",
              display: "block",
              borderRadius:
                shape === "square" || shape === "auth" || fit === "cover"
                  ? "var(--radius-md)"
                  : 0,
              pointerEvents: "none",
            }}
          />
        </button>

        {onRemove ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              height: 28,
              padding: "0 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-muted)",
              background: "var(--bg-card)",
              color: "var(--text-1)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Remover
          </button>
        ) : null}
      </div>

      {/* Título + legenda na mesma linha (alinhado entre logo · ícone · auth) */}
      <div
        className="flex flex-wrap items-baseline min-w-0"
        style={{ gap: "4px 8px", minHeight: 20 }}
      >
        <span
          className="shrink-0"
          style={{
            fontSize: 13.5,
            fontWeight: 650,
            color: "var(--text-1)",
            lineHeight: 1.25,
          }}
        >
          {label}
        </span>
        <span
          className="min-w-0 truncate"
          style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.25 }}
        >
          {caption}
        </span>
      </div>
    </div>
  );
}

function AddSlot({
  formId,
  accept,
  shape = "wide",
  onClick,
  onFile,
}: {
  formId: string;
  accept: string;
  shape?: TileShape;
  /** Clique sem arquivo → abre popup vazio */
  onClick?: () => void;
  /** Arraste com arquivo → abre popup já com imagem */
  onFile: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function take(f: File | null | undefined) {
    if (!f) return;
    onFile(f);
  }

  return (
    <div className="flex flex-col min-w-0" style={{ gap: 10 }}>
      <input
        ref={inputRef}
        id={formId}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => {
          if (onClick) onClick();
          else inputRef.current?.click();
        }}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
        className="w-full flex flex-col items-center justify-center"
        style={{
          ...tileBoxStyle(shape),
          borderRadius: "var(--radius-md)",
          border: dragOver
            ? "1px solid #ffffff"
            : "1px solid rgba(255,255,255,0.22)",
          background: "#ffffff",
          color: "#0a0f0c",
          cursor: "pointer",
          gap: 2,
          transition: "border-color 140ms ease, background 140ms ease",
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 600,
            lineHeight: 1,
            color: "#0a0f0c",
          }}
        >
          +
        </span>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "#0a0f0c",
          }}
        >
          Adicionar
        </span>
      </button>
    </div>
  );
}

