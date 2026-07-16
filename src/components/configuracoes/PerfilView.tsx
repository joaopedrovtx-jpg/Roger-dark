"use client";

import { useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import { dashboardMock } from "@/lib/mock/dashboard";

/** Ícone Icons8 (copiar) — preto no botão branco */
const COPY_ICON_FILTER = "brightness(0)";

const ACCOUNT_ID = "cmf2sj7vn0jpckxxa3u31r7pc";
const MAX_MB = 30;
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

export function PerfilView() {
  const user = dashboardMock.user;
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user.name);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("igor.rocha@darkpay.app");
  const [phone, setPhone] = useState("(11) 98800-0000");
  const [preview, setPreview] = useState<string | null>(user.avatarUrl);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(ACCOUNT_ID);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
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
      alert("Apenas arquivos png, jpeg, jpg e webp são aceitos.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`O tamanho máximo é ${MAX_MB}MB.`);
      return;
    }
    setPreview(URL.createObjectURL(file));
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
            {ACCOUNT_ID}
          </code>
          <button
            type="button"
            onClick={copyId}
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
            Ao alterar os detalhes, sua conta passará por uma nova avaliação pelo
            setor de Compliance.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            alert("Detalhes salvos (mock).");
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(200px,240px)] gap-5 items-start">
            <div className="flex flex-col gap-3.5 min-w-0">
              <label className="flex flex-col">
                <FieldLabel required>Nome</FieldLabel>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={fieldStyle}
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
                  style={fieldStyle}
                />
              </label>

              <label className="flex flex-col">
                <FieldLabel>Email</FieldLabel>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={fieldStyle}
                />
              </label>

              <label className="flex flex-col">
                <FieldLabel required>Telefone</FieldLabel>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={fieldStyle}
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
            </div>
          </div>

          <button
            type="submit"
            className="w-full font-semibold text-[14px] mt-5 transition-opacity hover:opacity-90"
            style={{
              height: 44,
              border: "none",
              borderRadius: "var(--radius-md)",
              background: "var(--green-use)",
              color: "var(--on-green)",
              cursor: "pointer",
            }}
          >
            Salvar
          </button>
        </form>
      </div>
    </div>
  );
}
