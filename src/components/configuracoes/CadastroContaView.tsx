"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Upload } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { authedFetch } from "@/lib/client/session";
import {
  DOC_KIND_LABELS,
  REQUIRED_DOC_KINDS,
} from "@/lib/kyc";
import type { SellerDocKind } from "@/lib/domain/types";
import {
  IconClockFilled,
  IconDocumentosFilled,
  IconUserProfileFilled,
} from "@/components/dashboard/KpiIcons";

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
  disabled,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        ...fieldShell,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <FieldLabel required={required && !disabled}>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle,
          cursor: disabled ? "default" : undefined,
          color: disabled ? "var(--text-2)" : inputStyle.color,
        }}
      />
      {/* Camada só por cima deste input (não do formulário inteiro) */}
      {disabled ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "var(--radius-md)",
            background: "rgba(10, 14, 20, 0.32)",
            pointerEvents: "auto",
            cursor: "not-allowed",
            zIndex: 1,
          }}
        />
      ) : null}
    </label>
  );
}

function SelectField({
  label,
  required,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        ...fieldShell,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <FieldLabel required={required && !disabled}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...inputStyle,
            appearance: "none",
            WebkitAppearance: "none",
            cursor: disabled ? "default" : "pointer",
            flex: 1,
            color: disabled ? "var(--text-2)" : inputStyle.color,
          }}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {!disabled ? (
          <ChevronDown
            size={16}
            style={{ color: "var(--text-3)", flexShrink: 0 }}
            aria-hidden
          />
        ) : null}
      </div>
      {disabled ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "var(--radius-md)",
            background: "rgba(10, 14, 20, 0.32)",
            pointerEvents: "auto",
            cursor: "not-allowed",
            zIndex: 1,
          }}
        />
      ) : null}
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
        onClick={() => {
          // limpa value p/ permitir escolher o mesmo arquivo de novo
          if (inputRef.current) inputRef.current.value = "";
          inputRef.current?.click();
        }}
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
        title={file ? "Clique para substituir o arquivo" : undefined}
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
            alt={sideLabel ? `${label} ${sideLabel}` : label}
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
    </div>
  );
}

function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}

function formatCpf(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function formatCnpj(v: string): string {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatCep(v: string): string {
  const d = onlyDigits(v).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

/** Data de nascimento: DD/MM/AAAA máx. 8 dígitos */
function formatBirthDate(v: string): string {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function formatPhoneBr(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function InformacoesPanel() {
  const { user, refresh } = useAuth();
  const [tipo, setTipo] = useState("Pessoa física");
  const isPj = tipo === "Pessoa jurídica";

  // PF
  const [cpf, setCpf] = useState("");
  const [nome, setNome] = useState(user?.name ?? "");
  const [nomeMae, setNomeMae] = useState("");
  const [nascimento, setNascimento] = useState("");

  // PJ empresa
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [nomeFantasia, setNomeFantasia] = useState("");
  const [inscricaoEstadual, setInscricaoEstadual] = useState("");
  const [telefoneEmpresa, setTelefoneEmpresa] = useState("");
  // Representante legal
  const [repNome, setRepNome] = useState(user?.name ?? "");
  const [repCpf, setRepCpf] = useState("");
  const [repNascimento, setRepNascimento] = useState("");

  const [cep, setCep] = useState("");
  const [pais, setPais] = useState("Brasil");
  const [estado, setEstado] = useState("São Paulo");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");

  const [openEmpresa, setOpenEmpresa] = useState(true);
  const [openEmpresario, setOpenEmpresario] = useState(true);
  const [openRep, setOpenRep] = useState(true);
  const [openEndereco, setOpenEndereco] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  /** Após salvar (ou se já tinha cadastro no banco): campos fixos, botão some */
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/v1/account/profile");
        if (!res.ok) return;
        const p = (await res.json()) as {
          personType?: string;
          document?: string | null;
          cnpj?: string | null;
          company?: string | null;
          displayName?: string | null;
          name?: string | null;
          phone?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
        };
        if (cancelled) return;
        const pj = p.personType === "pj";
        setTipo(pj ? "Pessoa jurídica" : "Pessoa física");
        if (pj) {
          setCnpj(formatCnpj(p.cnpj || p.document || ""));
          setRazaoSocial(p.company || "");
          setNomeFantasia(p.displayName || "");
          setRepNome(p.name || "");
          setTelefoneEmpresa(formatPhoneBr(p.phone || ""));
        } else {
          setCpf(formatCpf(p.document || ""));
          setNome(p.name || "");
        }
        setCep(formatCep(p.zip || ""));
        setCidade(p.city || "");
        setEstado(p.state || "São Paulo");
        // address pode vir "rua, 123" usa como logradouro
        setEndereco(p.address || "");

        // Já tem documento cadastrado → formulário travado
        const docDigits = onlyDigits(p.cnpj || p.document || "");
        const alreadySaved = pj
          ? docDigits.length === 14 && Boolean((p.company || "").trim())
          : docDigits.length === 11;
        if (alreadySaved) {
          setLocked(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const status = user?.status ?? "pendente";
  const docsSubmitted = Boolean(user?.kyc?.docsSubmitted);

  let statusBanner: ReactNode = null;
  if (status === "ativo") {
    statusBanner = (
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
    );
  } else if (status === "bloqueado") {
    statusBanner = (
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "var(--radius-md)",
          background: "rgba(239, 68, 68, 0.1)",
          borderLeft: "3px solid #ef4444",
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#ef4444" }}>
          Conta bloqueada. Fale com o suporte.
        </p>
      </div>
    );
  } else if (docsSubmitted) {
    statusBanner = (
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "var(--radius-md)",
          background: "rgba(245, 166, 35, 0.1)",
          borderLeft: "3px solid #f5a623",
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#f5a623" }}>
          Documentos em análise. Aguarde a liberação do gateway.
        </p>
      </div>
    );
  } else {
    statusBanner = (
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "var(--radius-md)",
          background: "rgba(245, 166, 35, 0.1)",
          borderLeft: "3px solid #f5a623",
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#f5a623" }}>
          Conta pendente. Complete as informações e envie os documentos para
          liberar o gateway.
        </p>
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr(null);
    try {
      const addressLine = [endereco, numero && `nº ${numero}`, bairro, complemento]
        .filter(Boolean)
        .join(", ");

      const payload = isPj
        ? {
            personType: "pj" as const,
            cnpj: onlyDigits(cnpj),
            company: razaoSocial.trim(),
            displayName: nomeFantasia.trim() || razaoSocial.trim(),
            name: repNome.trim() || razaoSocial.trim(),
            phone: onlyDigits(telefoneEmpresa),
            representativeDocument: onlyDigits(repCpf),
            address: addressLine || endereco.trim(),
            city: cidade.trim(),
            state: estado,
            zip: onlyDigits(cep),
          }
        : {
            personType: "pf" as const,
            document: onlyDigits(cpf),
            name: nome.trim(),
            displayName: nome.trim(),
            address: addressLine || endereco.trim(),
            city: cidade.trim(),
            state: estado,
            zip: onlyDigits(cep),
          };

      const res = await authedFetch("/api/v1/account/profile", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveErr(json.error || "Falha ao salvar");
        return;
      }
      setLocked(true);
      await refresh();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

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
          {isPj
            ? "Cadastro de pessoa jurídica: informe CNPJ e os dados da empresa."
            : "Configure as principais informações sobre seu negócio."}
        </p>
      </div>

      {statusBanner}

      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)" }}>
          Carregando dados…
        </p>
      ) : null}

      <div className="flex flex-col" style={{ gap: 22 }}>
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        <SelectField
          label="Tipo de cadastro"
          required
          disabled={locked}
          value={tipo}
          onChange={(v) => {
            setTipo(v);
            setSaveErr(null);
          }}
          options={["Pessoa física", "Pessoa jurídica"]}
        />
        {isPj ? (
          <TextField
            label="CNPJ"
            required
            disabled={locked}
            value={cnpj}
            onChange={(v) => setCnpj(formatCnpj(v))}
            placeholder="00.000.000/0000-00"
          />
        ) : (
          <TextField
            label="CPF"
            required
            disabled={locked}
            value={cpf}
            onChange={(v) => setCpf(formatCpf(v))}
            placeholder="000.000.000-00"
          />
        )}
      </div>

      {isPj ? (
        <>
          {/* Dados da empresa */}
          <div className="flex flex-col" style={{ gap: 14, marginTop: 4 }}>
            <SectionTitle
              open={openEmpresa}
              onToggle={() => !locked && setOpenEmpresa((v) => !v)}
            >
              Informações da empresa
            </SectionTitle>
            {openEmpresa ? (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                <TextField
                  label="Razão social"
                  required
                  disabled={locked}
                  value={razaoSocial}
                  onChange={setRazaoSocial}
                  placeholder="Nome registrado na Receita Federal"
                />
                <TextField
                  label="Nome fantasia"
                  disabled={locked}
                  value={nomeFantasia}
                  onChange={setNomeFantasia}
                  placeholder="Nome comercial (opcional)"
                />
                <TextField
                  label="CNPJ"
                  required
                  disabled={locked}
                  value={cnpj}
                  onChange={(v) => setCnpj(formatCnpj(v))}
                  placeholder="00.000.000/0000-00"
                />
                <TextField
                  label="Inscrição estadual"
                  disabled={locked}
                  value={inscricaoEstadual}
                  onChange={setInscricaoEstadual}
                  placeholder="Isento ou número"
                />
                <TextField
                  label="Telefone comercial"
                  required
                  disabled={locked}
                  value={telefoneEmpresa}
                  onChange={(v) => setTelefoneEmpresa(formatPhoneBr(v))}
                  placeholder="(11) 99999-9999"
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

          {/* Representante legal */}
          <div className="flex flex-col" style={{ gap: 14 }}>
            <SectionTitle
              open={openRep}
              onToggle={() => !locked && setOpenRep((v) => !v)}
            >
              Representante legal
            </SectionTitle>
            {openRep ? (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                <TextField
                  label="Nome completo"
                  required
                  disabled={locked}
                  value={repNome}
                  onChange={setRepNome}
                  placeholder="Quem assina pela empresa"
                />
                <TextField
                  label="CPF do representante"
                  required
                  disabled={locked}
                  value={repCpf}
                  onChange={(v) => setRepCpf(formatCpf(v))}
                  placeholder="000.000.000-00"
                />
                <TextField
                  label="Data de nascimento"
                  disabled={locked}
                  value={repNascimento}
                  onChange={(v) => setRepNascimento(formatBirthDate(v))}
                  placeholder="DD/MM/AAAA"
                />
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-col" style={{ gap: 14, marginTop: 4 }}>
          <SectionTitle
            open={openEmpresario}
            onToggle={() => !locked && setOpenEmpresario((v) => !v)}
          >
            Informações do empresário
          </SectionTitle>
          {openEmpresario ? (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
              <TextField
                label="Nome completo"
                required
                disabled={locked}
                value={nome}
                onChange={setNome}
              />
              <TextField
                label="Nome da mãe"
                required
                disabled={locked}
                value={nomeMae}
                onChange={setNomeMae}
              />
              <TextField
                label="Data de nascimento"
                required
                disabled={locked}
                value={nascimento}
                onChange={(v) => setNascimento(formatBirthDate(v))}
                placeholder="DD/MM/AAAA"
              />
            </div>
          ) : null}
        </div>
      )}

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
          onToggle={() => !locked && setOpenEndereco((v) => !v)}
        >
          {isPj ? "Endereço da empresa" : "Endereço"}
        </SectionTitle>
        {openEndereco ? (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            <TextField
              label="CEP"
              required
              disabled={locked}
              value={cep}
              onChange={(v) => setCep(formatCep(v))}
              placeholder="00000-000"
            />
            <SelectField
              label="País"
              required
              disabled={locked}
              value={pais}
              onChange={setPais}
              options={["Brasil", "Outro"]}
            />
            <SelectField
              label="Estado"
              required
              disabled={locked}
              value={estado}
              onChange={setEstado}
              options={[
                "Acre",
                "Alagoas",
                "Amapá",
                "Amazonas",
                "Bahia",
                "Ceará",
                "Distrito Federal",
                "Espírito Santo",
                "Goiás",
                "Maranhão",
                "Mato Grosso",
                "Mato Grosso do Sul",
                "Minas Gerais",
                "Pará",
                "Paraíba",
                "Paraná",
                "Pernambuco",
                "Piauí",
                "Rio de Janeiro",
                "Rio Grande do Norte",
                "Rio Grande do Sul",
                "Rondônia",
                "Roraima",
                "Santa Catarina",
                "São Paulo",
                "Sergipe",
                "Tocantins",
              ]}
            />
            <TextField
              label="Cidade"
              required
              disabled={locked}
              value={cidade}
              onChange={setCidade}
            />
            <TextField
              label="Bairro"
              required
              disabled={locked}
              value={bairro}
              onChange={setBairro}
            />
            <TextField
              label="Logradouro"
              required
              disabled={locked}
              value={endereco}
              onChange={setEndereco}
              placeholder="Rua, avenida…"
            />
            <TextField
              label="Número"
              required
              disabled={locked}
              value={numero}
              onChange={setNumero}
            />
            <TextField
              label="Complemento"
              disabled={locked}
              value={complemento}
              onChange={setComplemento}
              placeholder="Sala, andar… (opcional)"
            />
          </div>
        ) : null}
      </div>
      </div>

      {saveErr && !locked ? (
        <p style={{ margin: 0, fontSize: 13, color: "#ef4444", fontWeight: 600 }}>
          {saveErr}
        </p>
      ) : null}

      {!locked ? (
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void handleSave()}
          className="self-start font-semibold"
          style={{
            height: 42,
            padding: "0 20px",
            borderRadius: "var(--radius-md)",
            border: "none",
            background: saving ? "var(--bg-elevated)" : "var(--green-use)",
            color: saving ? "var(--text-3)" : "var(--on-green)",
            fontSize: 13.5,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving
            ? "Salvando…"
            : isPj
              ? "Salvar dados da empresa"
              : "Salvar informações"}
        </button>
      ) : null}
    </div>
  );
}

type DocSlot = {
  kind: SellerDocKind;
  file: File | null;
  preview: string | null;
  serverStatus?: string | null;
};

const DOC_SLOTS_META: Array<{
  kind: SellerDocKind;
  title: string;
  description: string;
}> = [
  {
    kind: "doc_frente",
    title: "RG / documento frente",
    description:
      "Foto ou scan da frente do RG, CNH ou documento com foto, nome completo e data de nascimento.",
  },
  {
    kind: "doc_verso",
    title: "RG / documento verso",
    description: "Foto ou scan do verso do mesmo documento de identificação.",
  },
  {
    kind: "selfie",
    title: "Selfie com documento",
    description:
      "Foto sua segurando o documento. Deve ser possível ver o rosto e o documento com clareza.",
  },
  {
    kind: "contrato_social",
    title: "Contrato social",
    description:
      "Contrato social ou documento da empresa (PDF ou imagem).",
  },
];

/**
 * Ícones no mesmo padrão da plataforma (filled / Flaticon em KpiIcons).
 * - frente / verso: documentos-perfil
 * - selfie: usuário perfil
 * - contrato (PDF): comprovante
 */
function DocKindIcon({
  kind,
  size = 20,
}: {
  kind: SellerDocKind;
  size?: number;
}) {
  if (kind === "selfie") {
    return <IconUserProfileFilled size={size} tone="white" />;
  }
  if (kind === "contrato_social") {
    // Comprovante / PDF contrato social
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/icons/comprovante.png"
        alt=""
        width={size}
        height={size}
        aria-hidden
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          filter: "brightness(0) saturate(100%) invert(1)",
          display: "block",
        }}
      />
    );
  }
  // doc_frente + doc_verso documentos da plataforma
  return <IconDocumentosFilled size={size} tone="white" />;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

/**
 * Envio dos 4 documentos obrigatórios:
 * RG frente, RG verso, selfie e contrato social.
 */
function DocumentosPanel() {
  const { user, refresh } = useAuth();
  const [slots, setSlots] = useState<Record<SellerDocKind, DocSlot>>(() => {
    const init = {} as Record<SellerDocKind, DocSlot>;
    for (const kind of REQUIRED_DOC_KINDS) {
      init[kind] = { kind, file: null, preview: null, serverStatus: null };
    }
    return init;
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadServer = useCallback(async () => {
    try {
      const res = await authedFetch("/api/v1/documents");
      if (!res.ok) return;
      const json = (await res.json()) as {
        documents?: Array<{
          kind: string;
          status: string;
          previewUrl?: string | null;
        }>;
        kyc?: { docsSubmitted?: boolean };
      };
      const docs = json.documents ?? [];
      setSlots((prev) => {
        const next = { ...prev };
        for (const kind of REQUIRED_DOC_KINDS) {
          const found = docs.find((d) => d.kind === kind);
          if (found) {
            const preview =
              found.previewUrl && found.previewUrl.startsWith("data:")
                ? found.previewUrl
                : prev[kind].preview;
            next[kind] = {
              ...next[kind],
              serverStatus: found.status,
              preview: preview ?? null,
            };
          }
        }
        return next;
      });
      if (json.kyc?.docsSubmitted) setSubmitted(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadServer();
  }, [loadServer]);

  function assignFile(kind: SellerDocKind, f: File | null) {
    setSlots((prev) => {
      const cur = prev[kind];
      if (cur.preview && cur.preview.startsWith("blob:")) {
        URL.revokeObjectURL(cur.preview);
      }
      return {
        ...prev,
        [kind]: {
          kind,
          file: f,
          preview:
            f && f.type.startsWith("image/")
              ? URL.createObjectURL(f)
              : f
                ? null
                : null,
          serverStatus: f ? null : cur.serverStatus,
        },
      };
    });
    setSubmitted(false);
    setError(null);
  }

  // Envio exige os 4 arquivos
  const hasAllNewFiles = REQUIRED_DOC_KINDS.every((k) => Boolean(slots[k].file));
  const readyToPost = hasAllNewFiles;

  async function handleSubmit() {
    if (!readyToPost || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const documents = [];
      for (const kind of REQUIRED_DOC_KINDS) {
        const slot = slots[kind];
        if (!slot.file) {
          setError(`Falta o arquivo: ${DOC_KIND_LABELS[kind]}`);
          setSubmitting(false);
          return;
        }
        let dataUrl: string | null = null;
        // só embute preview se for imagem pequena o bastante
        if (slot.file.size <= 700_000) {
          try {
            dataUrl = await fileToDataUrl(slot.file);
          } catch {
            dataUrl = null;
          }
        }
        documents.push({
          kind,
          fileName: slot.file.name,
          dataUrl,
        });
      }

      const res = await authedFetch("/api/v1/documents", {
        method: "POST",
        body: JSON.stringify({ documents }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(json.error || "Falha ao enviar documentos");
        return;
      }
      setSubmitted(true);
      await refresh();
      await loadServer();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  const accountActive = user?.status === "ativo";

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
          {accountActive
            ? "Documentos aprovados"
            : "Envie seus documentos"}
        </h2>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 14,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          {accountActive
            ? "Seus documentos foram verificados e estão aprovados."
            : (
              <>
                Envie os{" "}
                <strong style={{ fontWeight: 650 }}>quatro</strong> documentos
                obrigatórios: RG frente, RG verso, selfie e contrato social.
              </>
            )}
        </p>
      </div>

      {/* Faixas só enquanto ainda não está aprovado (sem “Gateway liberado”) */}
      {!accountActive &&
      (submitted || user?.kyc?.docsSubmitted) ? (
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
            Documentos enviados. Em análise pela equipe. Você será liberado
            após a aprovação.
          </p>
        </div>
      ) : null}
      {!accountActive &&
      !(submitted || user?.kyc?.docsSubmitted) ? (
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
            Conta pendente. Envie os documentos abaixo para solicitar a
            aprovação.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {DOC_SLOTS_META.map((meta) => {
          const slot = slots[meta.kind];
          const awaitingApproval =
            !accountActive &&
            (submitted ||
              user?.kyc?.docsSubmitted ||
              slot.serverStatus === "pendente") &&
            (Boolean(slot.serverStatus) ||
              submitted ||
              Boolean(user?.kyc?.docsSubmitted));
          const rejected = slot.serverStatus === "rejeitado";
          const approved =
            accountActive || slot.serverStatus === "aprovado";

          // Após solicitar aprovação: amarelo fixo + relógio (pendente)
          const pendingLook = awaitingApproval && !rejected && !approved;
          // Conta/doc aprovado: card branco limpo + ícone de aprovado
          const approvedLook = approved && !rejected;

          return (
            <div
              key={meta.kind}
              className="flex flex-col"
              style={{
                gap: 10,
                padding: 16,
                borderRadius: "var(--radius-md)",
                border: pendingLook
                  ? "1px solid #ca8a04"
                  : approvedLook
                    ? "1px solid rgba(0,0,0,0.08)"
                    : "1px solid var(--border-card)",
                background: pendingLook
                  ? "#eab308"
                  : approvedLook
                    ? "#ffffff"
                    : "var(--bg-app)",
              }}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="flex shrink-0 items-center justify-center"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-card-inner-icon)",
                  }}
                >
                  {pendingLook ? (
                    <IconClockFilled size={22} color="#eab308" />
                  ) : (
                    <DocKindIcon kind={meta.kind} size={22} />
                  )}
                </span>
                <div className="min-w-0">
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 14.5,
                      fontWeight: 650,
                      color: pendingLook
                        ? "#0a0f0c"
                        : approvedLook
                          ? "#0a0f0c"
                          : "var(--text-1)",
                      lineHeight: 1.3,
                    }}
                  >
                    {meta.title}
                    {!pendingLook && !approvedLook ? (
                      <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>
                    ) : null}
                  </h3>
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 12.5,
                      color: pendingLook
                        ? "rgba(10, 15, 12, 0.78)"
                        : approvedLook
                          ? "rgba(10, 15, 12, 0.65)"
                          : "var(--text-2)",
                      lineHeight: 1.45,
                      fontWeight: pendingLook || approvedLook ? 650 : 400,
                    }}
                  >
                    {approvedLook
                      ? "Aprovado"
                      : pendingLook
                        ? "Enviado aguardando aprovação"
                        : meta.description}
                  </p>
                  {rejected ? (
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#ef4444",
                      }}
                    >
                      Rejeitado. Reenvie
                    </p>
                  ) : null}
                </div>
              </div>
              {/*
                Aprovado: só card branco + check (sem preview / drop).
                Em análise: só ícone + nome + status.
                Pendente de envio: dropzone.
              */}
              {approvedLook || pendingLook ? null : (
                <DocDropZone
                  compact
                  label={meta.title}
                  file={slot.file}
                  preview={slot.preview}
                  onFile={(f) => assignFile(meta.kind, f)}
                />
              )}
            </div>
          );
        })}
      </div>

      {error ? (
        <p style={{ margin: 0, fontSize: 13, color: "#ef4444", fontWeight: 600 }}>
          {error}
        </p>
      ) : null}

      {!accountActive ? (
        <button
          type="button"
          disabled={!readyToPost || submitting}
          onClick={() => void handleSubmit()}
          className="self-start font-semibold"
          style={{
            height: 42,
            padding: "0 20px",
            borderRadius: "var(--radius-md)",
            border: "none",
            marginTop: 4,
            background:
              readyToPost && !submitting
                ? "var(--green-use)"
                : "var(--bg-elevated)",
            color:
              readyToPost && !submitting
                ? "var(--on-green)"
                : "var(--text-3)",
            fontSize: 13.5,
            cursor:
              readyToPost && !submitting ? "pointer" : "not-allowed",
            opacity: readyToPost && !submitting ? 1 : 0.7,
          }}
        >
          {submitting
            ? "Enviando…"
            : submitted || user?.kyc?.docsSubmitted
              ? "Reenviar para análise"
              : "Solicitar aprovação"}
        </button>
      ) : null}

      {!loaded ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-3)" }}>
          Carregando status dos documentos…
        </p>
      ) : null}
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
      {/* Tabs cantos radius-md (padrão dashboard), sem pill */}
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
                // fundo escuro no ativo sem borda (o container já é cinza)
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
