"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, Upload } from "lucide-react";

type TabId = "informacoes" | "documentos";

const TABS: { id: TabId; label: string }[] = [
  { id: "informacoes", label: "Informações" },
  { id: "documentos", label: "Documentos" },
];

const fieldShell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "10px 14px",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-app)",
  border: "1px solid var(--border-card)",
  minHeight: 58,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-3)",
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-1)",
  fontSize: 14,
  fontWeight: 500,
  padding: 0,
};

function FieldLabel({
  children,
  required,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <span style={labelStyle}>
      {children}
      {required ? (
        <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>
      ) : null}
    </span>
  );
}

function TextField({
  label,
  required,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label style={fieldShell}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

function SelectField({
  label,
  required,
  value,
  onChange,
  options,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label style={{ ...fieldShell, position: "relative" }}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...inputStyle,
            appearance: "none",
            WebkitAppearance: "none",
            cursor: "pointer",
            flex: 1,
          }}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          style={{ color: "var(--text-3)", flexShrink: 0 }}
          aria-hidden
        />
      </div>
    </label>
  );
}

function SectionTitle({
  children,
  open,
  onToggle,
}: {
  children: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 text-left"
      style={{
        border: "none",
        background: "transparent",
        padding: "4px 0",
        cursor: "pointer",
        color: "var(--text-1)",
      }}
    >
      <ChevronDown
        size={18}
        style={{
          color: "var(--text-2)",
          transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform 150ms ease",
        }}
      />
      <span style={{ fontSize: 16, fontWeight: 650 }}>{children}</span>
    </button>
  );
}

const ACCEPT_IMG =
  "image/png,image/jpeg,image/jpg,image/webp,application/pdf";

function DocDropZone({
  file,
  preview,
  onFile,
  label,
  sideLabel,
  compact,
}: {
  file: File | null;
  preview: string | null;
  onFile: (f: File | null) => void;
  label: string;
  /** Ex.: "Frente" | "Verso" */
  sideLabel?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(f: File | null | undefined) {
    if (!f) return;
    const ok =
      f.type.startsWith("image/") ||
      f.type === "application/pdf" ||
      /\.(png|jpe?g|webp|pdf)$/i.test(f.name);
    if (!ok) {
      alert("Envie imagem (png, jpeg, webp) ou PDF.");
      return;
    }
    if (f.size > 30 * 1024 * 1024) {
      alert("Tamanho máximo: 30MB.");
      return;
    }
    onFile(f);
  }

  const isImage =
    Boolean(preview) && file && !file.type.includes("pdf");

  return (
    <div className="flex flex-col" style={{ gap: 8, flex: 1, minWidth: 0 }}>
      {sideLabel ? (
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 650,
            color: "var(--text-1)",
          }}
        >
          {sideLabel}
        </span>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_IMG}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
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
          minHeight: compact ? (isImage ? 140 : 100) : isImage ? 160 : 120,
          padding: 14,
          borderRadius: "var(--radius-md)",
          border: dragOver
            ? "1.5px dashed var(--text-1)"
            : "1.5px dashed var(--border-muted)",
          background: dragOver
            ? "rgba(255,255,255,0.04)"
            : "var(--bg-app)",
          cursor: "pointer",
          overflow: "hidden",
        }}
      >
        {isImage && preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={sideLabel ? `${label} — ${sideLabel}` : label}
            style={{
              width: "100%",
              maxHeight: compact ? 130 : 180,
              objectFit: "contain",
              borderRadius: "var(--radius-sm)",
            }}
          />
        ) : file ? (
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--text-1)",
              wordBreak: "break-all",
            }}
          >
            {file.name}
          </span>
        ) : (
          <>
            <span
              className="flex items-center justify-center mb-2"
              style={{
                width: 36,
                height: 36,
                borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)",
                color: "var(--text-3)",
              }}
            >
              <Upload size={16} strokeWidth={1.75} />
            </span>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--text-1)",
                lineHeight: 1.4,
              }}
            >
              Clique ou arraste
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                marginTop: 4,
              }}
            >
              PNG, JPEG, WEBP ou PDF
            </span>
          </>
        )}
      </button>
      {file ? (
        <button
          type="button"
          onClick={() => onFile(null)}
          style={{
            alignSelf: "flex-start",
            border: "none",
            background: "transparent",
            color: "var(--text-3)",
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Remover
        </button>
      ) : null}
    </div>
  );
}

function InformacoesPanel() {
  const [tipo, setTipo] = useState("Pessoa física");
  const [cpf, setCpf] = useState("470.624.418-80");
  const [intl, setIntl] = useState(false);
  const [nome, setNome] = useState("bianca militao da silva");
  const [nomeMae, setNomeMae] = useState("ednalva militao da silva");
  const [nascimento, setNascimento] = useState("25/01/1997");
  const [cep, setCep] = useState("13484-015");
  const [pais, setPais] = useState("Brasil");
  const [estado, setEstado] = useState("Paraná");
  const [cidade, setCidade] = useState("curitiba");
  const [bairro, setBairro] = useState("centro");
  const [endereco, setEndereco] = useState("tenorio vasconcelos");
  const [openEmpresario, setOpenEmpresario] = useState(true);
  const [openEndereco, setOpenEndereco] = useState(true);

  return (
    <div className="flex flex-col" style={{ gap: 22 }}>
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text-1)",
          }}
        >
          Dados principais
        </h2>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          Configure as principais informações sobre seu negócio.
        </p>
      </div>

      {/* Banner aprovado */}
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "var(--radius-md)",
          background: "rgba(255,255,255,0.04)",
          borderLeft: "3px solid var(--green-use)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: "var(--green-use)",
          }}
        >
          Seu cadastro foi aprovado!
        </p>
      </div>

      <div
        className="grid gap-3 grid-cols-1 md:grid-cols-2"
      >
        <SelectField
          label="Tipo de cadastro"
          required
          value={tipo}
          onChange={setTipo}
          options={["Pessoa física", "Pessoa jurídica"]}
        />
        <TextField label="CPF" required value={cpf} onChange={setCpf} />
      </div>

      <label
        className="inline-flex items-center gap-2.5"
        style={{ cursor: "pointer", width: "fit-content" }}
      >
        <input
          type="checkbox"
          checked={intl}
          onChange={(e) => setIntl(e.target.checked)}
          style={{
            width: 16,
            height: 16,
            accentColor: "var(--text-1)",
            cursor: "pointer",
          }}
        />
        <span style={{ fontSize: 14, color: "var(--text-2)", fontWeight: 500 }}>
          Atuarei internacionalmente
        </span>
      </label>

      <div className="flex flex-col" style={{ gap: 14, marginTop: 4 }}>
        <SectionTitle
          open={openEmpresario}
          onToggle={() => setOpenEmpresario((v) => !v)}
        >
          Informações do empresário
        </SectionTitle>
        {openEmpresario ? (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            <TextField label="Nome" required value={nome} onChange={setNome} />
            <TextField
              label="Nome da mãe"
              required
              value={nomeMae}
              onChange={setNomeMae}
            />
            <TextField
              label="Data de nascimento"
              required
              value={nascimento}
              onChange={setNascimento}
            />
          </div>
        ) : null}
      </div>

      <div
        style={{
          height: 1,
          background: "var(--border-card)",
          margin: "4px 0",
        }}
      />

      <div className="flex flex-col" style={{ gap: 14 }}>
        <SectionTitle
          open={openEndereco}
          onToggle={() => setOpenEndereco((v) => !v)}
        >
          Endereço
        </SectionTitle>
        {openEndereco ? (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            <TextField label="CEP" required value={cep} onChange={setCep} />
            <SelectField
              label="País"
              required
              value={pais}
              onChange={setPais}
              options={["Brasil", "Outro"]}
            />
            <SelectField
              label="Estado"
              required
              value={estado}
              onChange={setEstado}
              options={[
                "Paraná",
                "São Paulo",
                "Rio de Janeiro",
                "Minas Gerais",
                "Outro",
              ]}
            />
            <TextField
              label="Cidade"
              required
              value={cidade}
              onChange={setCidade}
            />
            <TextField
              label="Bairro"
              required
              value={bairro}
              onChange={setBairro}
            />
            <TextField
              label="Endereço"
              required
              value={endereco}
              onChange={setEndereco}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Versão original / preview do fluxo do usuário:
 * enviar documentos (clique ou arraste) + preview → solicitar aprovação.
 * (Não começa como “verificado”.)
 */
function DocumentosPanel() {
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function assignFile(
    f: File | null,
    prevUrl: string | null,
    setFile: (f: File | null) => void,
    setPreview: (u: string | null) => void
  ) {
    if (prevUrl) URL.revokeObjectURL(prevUrl);
    setFile(f);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    setSubmitted(false);
  }

  const canSubmit = Boolean(selfieFile && frontFile && backFile);

  return (
    <div className="flex flex-col" style={{ gap: 22 }}>
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text-1)",
          }}
        >
          Envie seus documentos
        </h2>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          Envie seus documentos para a análise da sua conta
        </p>
      </div>

      {submitted ? (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: "rgba(245, 166, 35, 0.1)",
            borderLeft: "3px solid #f5a623",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "#f5a623",
            }}
          >
            Documentos enviados — em análise pela equipe.
          </p>
        </div>
      ) : null}

      {/* 2 colunas — selfie | documento (layout da referência) */}
      <div className="grid gap-6 md:gap-0 grid-cols-1 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-start">
        {/* Selfie */}
        <div className="md:pr-6">
          <h3
            style={{
              margin: 0,
              fontSize: 15.5,
              fontWeight: 650,
              color: "var(--text-1)",
              lineHeight: 1.35,
            }}
          >
            Selfie segurando o documento de identificação
          </h3>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13.5,
              color: "var(--text-2)",
              lineHeight: 1.55,
            }}
          >
            <strong style={{ color: "var(--text-2)", fontWeight: 650 }}>
              Apenas um arquivo.
            </strong>{" "}
            Foto sua segurando o documento de identificação. Deve ser possível
            ver seu rosto e o documento.
          </p>

          <div style={{ marginTop: 14 }}>
            <DocDropZone
              label="Selfie com documento"
              file={selfieFile}
              preview={selfiePreview}
              onFile={(f) =>
                assignFile(f, selfiePreview, setSelfieFile, setSelfiePreview)
              }
            />
          </div>
        </div>

        <div
          aria-hidden
          className="hidden md:block"
          style={{
            width: 1,
            alignSelf: "stretch",
            minHeight: 120,
            background: "var(--border-card)",
          }}
        />

        {/* Documento frente e verso — 2 previews separados */}
        <div className="md:pl-6">
          <h3
            style={{
              margin: 0,
              fontSize: 15.5,
              fontWeight: 650,
              color: "var(--text-1)",
              lineHeight: 1.35,
            }}
          >
            Documento de identificação (frente e verso)
          </h3>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 13.5,
              color: "var(--text-2)",
              lineHeight: 1.55,
            }}
          >
            Envie{" "}
            <strong style={{ color: "var(--text-2)", fontWeight: 650 }}>
              dois arquivos
            </strong>
            : um da{" "}
            <strong style={{ fontWeight: 650 }}>frente</strong> e outro do{" "}
            <strong style={{ fontWeight: 650 }}>verso</strong> do documento
            (RG, CNH, etc). Deve conter nome completo, foto e data de
            nascimento.
          </p>

          <div
            className="grid gap-3 grid-cols-1 sm:grid-cols-2"
            style={{ marginTop: 14 }}
          >
            <DocDropZone
              compact
              sideLabel="Frente"
              label="Documento — frente"
              file={frontFile}
              preview={frontPreview}
              onFile={(f) =>
                assignFile(f, frontPreview, setFrontFile, setFrontPreview)
              }
            />
            <DocDropZone
              compact
              sideLabel="Verso"
              label="Documento — verso"
              file={backFile}
              preview={backPreview}
              onFile={(f) =>
                assignFile(f, backPreview, setBackFile, setBackPreview)
              }
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={!canSubmit || submitted}
        onClick={() => {
          setSubmitted(true);
          alert("Documentos enviados para aprovação (mock).");
        }}
        className="self-start font-semibold"
        style={{
          height: 42,
          padding: "0 20px",
          borderRadius: "var(--radius-md)",
          border: "none",
          marginTop: 8,
          background: canSubmit && !submitted ? "var(--green-use)" : "var(--bg-elevated)",
          color: canSubmit && !submitted ? "var(--on-green)" : "var(--text-3)",
          fontSize: 13.5,
          cursor: canSubmit && !submitted ? "pointer" : "not-allowed",
          opacity: canSubmit && !submitted ? 1 : 0.7,
        }}
      >
        {submitted ? "Enviado para análise" : "Solicitar aprovação"}
      </button>
    </div>
  );
}

export function CadastroContaView({
  initialTab = "informacoes",
}: {
  initialTab?: TabId;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);

  return (
    <div className="flex flex-col" style={{ gap: 18, maxWidth: 920 }}>
      {/* Tabs — cantos radius-md (padrão dashboard), sem pill */}
      <div
        className="inline-flex items-center self-start"
        style={{
          padding: 4,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-card)",
          gap: 2,
        }}
        role="tablist"
        aria-label="Cadastro da conta"
      >
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t.id)}
              style={{
                height: 34,
                padding: "0 16px",
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: "pointer",
                fontSize: 13.5,
                fontWeight: on ? 650 : 500,
                // fundo escuro no ativo — sem borda (o container já é cinza)
                background: on ? "var(--bg-card)" : "transparent",
                color: on ? "var(--text-1)" : "var(--text-2)",
                boxShadow: "none",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Card principal */}
      <div
        className="surface-card"
        style={{
          padding: "28px 28px 32px",
          borderRadius: "var(--radius-card)",
        }}
      >
        {tab === "informacoes" ? <InformacoesPanel /> : null}
        {tab === "documentos" ? <DocumentosPanel /> : null}
      </div>
    </div>
  );
}
