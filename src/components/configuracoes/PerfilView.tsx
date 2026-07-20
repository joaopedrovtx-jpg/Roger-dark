"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { authedFetch } from "@/lib/client/session";

/** Ícone Icons8 (copiar) — preto no botão branco */
const COPY_ICON_FILTER = "brightness(0)";

const MAX_MB = 2;
const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  fontSize: 14,
  outline: "none",
  background: "var(--bg-app)",
  border: "1px solid var(--border-muted)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-1)",
};

const fieldStyleLocked: React.CSSProperties = {
  ...fieldStyle,
  color: "var(--text-2)",
  cursor: "default",
  opacity: 0.95,
};

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <span
      className="block mb-1.5"
      style={{ fontSize: 12, color: "var(--text-3)" }}
    >
      {children}
      {required ? (
        <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>
      ) : null}
    </span>
  );
}

function formatPhoneBr(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.readAsDataURL(file);
  });
}

export function PerfilView() {
  const { user, isAdmin, refresh } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string>("pendente");
  const [preview, setPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Conta staff (admin/gerente) ou já ativa = perfil “aprovado” e campos fixos
  const accountApproved =
    isAdmin || status === "ativo" || user?.status === "ativo";

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch("/api/v1/account/profile");
      if (!res.ok) throw new Error("Não foi possível carregar o perfil");
      const p = (await res.json()) as {
        id?: string;
        name?: string;
        displayName?: string | null;
        email?: string;
        phone?: string | null;
        avatarUrl?: string | null;
        status?: string;
      };
      setAccountId(p.id || user?.id || "");
      setName(p.name || user?.name || "");
      setDisplayName(p.displayName || p.name || user?.displayName || "");
      setEmail(p.email || user?.email || "");
      setPhone(formatPhoneBr(p.phone || ""));
      setStatus(p.status || user?.status || "pendente");
      setPreview(p.avatarUrl || user?.avatarUrl || null);
      setAvatarFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
      // fallback auth
      setAccountId(user?.id || "");
      setName(user?.name || "");
      setDisplayName(user?.displayName || user?.name || "");
      setEmail(user?.email || "");
      setPreview(user?.avatarUrl || null);
      setStatus(user?.status || "pendente");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function copyId() {
    if (!accountId) return;
    try {
      await navigator.clipboard.writeText(accountId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function handleFile(file: File | null | undefined) {
    if (!file) return;
    const okType = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ].includes(file.type);
    if (!okType) {
      setError("Apenas arquivos png, jpeg, jpg e webp são aceitos.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`O tamanho máximo é ${MAX_MB}MB.`);
      return;
    }
    setError(null);
    setOkMsg(null);
    if (preview && preview.startsWith("blob:")) {
      URL.revokeObjectURL(preview);
    }
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSavePhoto(e: React.FormEvent) {
    e.preventDefault();
    if (!avatarFile || saving) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const dataUrl = await fileToDataUrl(avatarFile);
      const res = await authedFetch("/api/v1/account/profile", {
        method: "PATCH",
        body: JSON.stringify({
          profileOnly: true,
          avatarUrl: dataUrl,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        avatarUrl?: string | null;
      };
      if (!res.ok) {
        setError(json.error || "Falha ao salvar foto");
        return;
      }
      setAvatarFile(null);
      if (json.avatarUrl) setPreview(json.avatarUrl);
      setOkMsg("Foto de perfil atualizada.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const showSave = Boolean(avatarFile);

  if (loading) {
    return (
      <div
        style={{
          padding: 24,
          color: "var(--text-3)",
          fontSize: 13,
        }}
      >
        Carregando perfil…
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 18, maxWidth: 820 }}>
      <div
        className="surface-card"
        style={{
          padding: "22px 22px 20px",
          borderRadius: "var(--radius-card)",
        }}
      >
        <h1
          className="font-bold"
          style={{ fontSize: 18, color: "var(--text-1)", marginBottom: 10 }}
        >
          Detalhes da conta
        </h1>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            ID da conta:
          </span>
          <code
            className="tabular"
            style={{
              fontSize: 12,
              color: "var(--text-2)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {accountId || "—"}
          </code>
          <button
            type="button"
            onClick={() => void copyId()}
            aria-label="Copiar ID da conta"
            className="inline-flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "none",
              background: "var(--green-use)",
              color: "var(--on-green)",
              cursor: "pointer",
            }}
          >
            {copied ? (
              <Check size={14} strokeWidth={2.5} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/icons/copiar.png"
                alt=""
                width={15}
                height={15}
                aria-hidden
                style={{
                  width: 15,
                  height: 15,
                  objectFit: "contain",
                  filter: COPY_ICON_FILTER,
                  display: "block",
                }}
              />
            )}
          </button>
        </div>

        {accountApproved ? (
          <div
            className="mb-5"
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: "rgba(255,255,255,0.04)",
              borderLeft: "3px solid var(--green-use)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.45,
                fontWeight: 600,
                color: "var(--green-use)",
              }}
            >
              {isAdmin
                ? "Conta aprovada. Dados do perfil carregados e salvos."
                : "Seu cadastro foi aprovado!"}
            </p>
          </div>
        ) : (
          <div
            className="mb-5"
            style={{
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: "rgba(239, 68, 68, 0.08)",
              borderLeft: "3px solid #ef4444",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.45,
                color: "#f87171",
              }}
            >
              Ao alterar os detalhes, sua conta passará por uma nova avaliação
              pelo setor de Compliance.
            </p>
          </div>
        )}

        <form onSubmit={(e) => void handleSavePhoto(e)}>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(200px,240px)] gap-5 items-start">
            <div className="flex flex-col gap-3.5 min-w-0">
              <label className="flex flex-col">
                <FieldLabel required>Nome</FieldLabel>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  readOnly={accountApproved}
                  style={accountApproved ? fieldStyleLocked : fieldStyle}
                  required
                />
              </label>

              <label className="flex flex-col">
                <FieldLabel>Nome de exibição</FieldLabel>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Nome para exibição"
                  readOnly={accountApproved}
                  style={accountApproved ? fieldStyleLocked : fieldStyle}
                />
              </label>

              <label className="flex flex-col">
                <FieldLabel>Email</FieldLabel>
                <input
                  type="email"
                  value={email}
                  readOnly
                  style={fieldStyleLocked}
                />
              </label>

              <label className="flex flex-col">
                <FieldLabel required>Telefone</FieldLabel>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneBr(e.target.value))}
                  readOnly={accountApproved}
                  style={accountApproved ? fieldStyleLocked : fieldStyle}
                  required
                />
              </label>
            </div>

            <div className="min-w-0">
              <FieldLabel>Foto de perfil</FieldLabel>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className="w-full flex flex-col items-center justify-center text-center"
                style={{
                  minHeight: 220,
                  padding: preview ? 12 : 16,
                  borderRadius: "var(--radius-md)",
                  border: dragOver
                    ? "1.5px dashed var(--green-use)"
                    : "1.5px dashed var(--border-muted)",
                  background: dragOver
                    ? "rgba(255, 255, 255, 0.04)"
                    : "var(--bg-app)",
                  cursor: "pointer",
                  overflow: "hidden",
                }}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt="Foto de perfil"
                    style={{
                      width: "100%",
                      height: 196,
                      borderRadius: "var(--radius-sm)",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <>
                    <span
                      className="flex items-center justify-center mb-3"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "var(--radius-full)",
                        background: "var(--bg-elevated)",
                        color: "var(--text-3)",
                      }}
                    >
                      <Upload size={22} strokeWidth={1.75} />
                    </span>
                    <span
                      className="font-semibold"
                      style={{
                        fontSize: 13,
                        color: "var(--text-1)",
                        lineHeight: 1.4,
                      }}
                    >
                      Clique para enviar ou
                      <br />
                      arraste até aqui
                    </span>
                    <span
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-3)",
                        marginTop: 10,
                        lineHeight: 1.45,
                      }}
                    >
                      Apenas arquivos png, jpeg, jpg
                      <br />
                      e webp são aceitos
                      <br />
                      O tamanho máximo é {MAX_MB}MB
                    </span>
                  </>
                )}
              </button>
              {preview ? (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 11.5,
                    color: "var(--text-3)",
                    textAlign: "center",
                  }}
                >
                  Clique na foto para trocar
                </p>
              ) : null}
            </div>
          </div>

          {error ? (
            <p
              style={{
                margin: "14px 0 0",
                fontSize: 13,
                color: "#ef4444",
                fontWeight: 600,
              }}
            >
              {error}
            </p>
          ) : null}
          {okMsg ? (
            <p
              style={{
                margin: "14px 0 0",
                fontSize: 13,
                color: "var(--green-use)",
                fontWeight: 600,
              }}
            >
              {okMsg}
            </p>
          ) : null}

          {/* Só aparece se o usuário escolheu uma nova foto */}
          {showSave ? (
            <button
              type="submit"
              disabled={saving}
              className="w-full font-semibold text-[14px] mt-5 transition-opacity hover:opacity-90"
              style={{
                height: 44,
                border: "none",
                borderRadius: "var(--radius-md)",
                background: "var(--green-use)",
                color: "var(--on-green)",
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Salvando…" : "Salvar foto"}
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
