"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { formatBRL } from "@/lib/format";
import type { PaymentCharge } from "@/lib/server/memory-store";
import { authedFetch } from "@/lib/client/session";
import { emitSaleEvent } from "@/lib/notifications";

type CreateResult = {
  id: string;
  status: string;
  amount: number;
  provider?: string;
  routingMode?: string;
  real?: boolean;
  env?: string;
  pix?: { qrCode?: string; copyPaste?: string };
  expiresAt?: string;
  transactionId?: string;
  message?: string;
  sellerId?: string;
  sellerEmail?: string;
  authVia?: string;
  paidAt?: string;
};

type AccountCred = {
  id: string;
  name: string;
  publicKey: string;
  secretKey: string | null;
  secretKeyHint?: string | null;
  permissions: string[];
  active?: boolean;
  env?: "live" | "test";
  expiresAt?: string | null;
};

const SESSION_SECRETS = "darkpay.api.session_secrets.v1";
const PLAYGROUND_SECRET = "darkpay.api.playground_secret.v1";

/** Secret real da conta (não máscara tipo sk_live_…xxxx) */
function isFullApiSecret(secret: string): boolean {
  const s = secret.trim();
  if (!s.startsWith("sk_live_") && !s.startsWith("sk_test_")) return false;
  if (s.includes("…") || s.includes("•") || s.includes("...")) return false;
  // chaves antigas podiam ser um pouco mais curtas
  return s.length >= 20 && /^sk_(live|test)_[a-zA-Z0-9]+$/.test(s);
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

function loadPlaygroundSecret(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(PLAYGROUND_SECRET) || "";
  } catch {
    return "";
  }
}

function savePlaygroundSecret(sk: string) {
  if (typeof window === "undefined") return;
  try {
    if (sk.trim()) window.sessionStorage.setItem(PLAYGROUND_SECRET, sk.trim());
    else window.sessionStorage.removeItem(PLAYGROUND_SECRET);
  } catch {
    /* private mode */
  }
}

/** Resolve URL de imagem QR: data:/http: da API, ou gera a partir do EMV */
async function resolvePixQrImage(pix?: {
  qrCode?: string;
  copyPaste?: string;
}): Promise<string | null> {
  if (!pix) return null;
  const qr = (pix.qrCode || "").trim();
  if (
    qr.startsWith("data:image") ||
    qr.startsWith("http://") ||
    qr.startsWith("https://")
  ) {
    return qr;
  }
  const emv = (pix.copyPaste || (qr.startsWith("000201") ? qr : "")).trim();
  if (!emv) return null;
  try {
    const QRCode = (await import("qrcode")).default;
    return await QRCode.toDataURL(emv, {
      width: 260,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0f0c", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

/**
 * Playground PIX autenticado com as credenciais de API da conta do seller
 * (Integrações → API → pk_live_/sk_live_).
 */
export function PagamentosApiView() {
  const [amount, setAmount] = useState("97.00");
  const [description, setDescription] = useState("Pedido");
  const [customerName, setCustomerName] = useState("");
  const [customerDocument, setCustomerDocument] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [result, setResult] = useState<CreateResult | null>(null);
  const resultRef = useRef<CreateResult | null>(null);
  resultRef.current = result;
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [list, setList] = useState<PaymentCharge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [creds, setCreds] = useState<AccountCred[]>([]);
  const [selectedCredId, setSelectedCredId] = useState<string>("");
  const [secretKey, setSecretKey] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [credsLoaded, setCredsLoaded] = useState(false);
  const [accountLabel, setAccountLabel] = useState<string>("");

  const selected = useMemo(
    () => creds.find((c) => c.id === selectedCredId) || null,
    [creds, selectedCredId]
  );

  const activeSecret = secretKey.trim();
  const hasApiKey = isFullApiSecret(activeSecret);
  const secretLooksMasked =
    activeSecret.length > 0 &&
    !hasApiKey &&
    (activeSecret.includes("…") ||
      activeSecret.includes("•") ||
      (activeSecret.startsWith("sk_") && activeSecret.length < 40));

  /**
   * Playground: sempre mantém cookie de sessão como fallback.
   * Se a sk_ estiver errada/máscara, o servidor autentica pela sessão logada
   * (evita o falso “Chave de API expirada” no painel).
   */
  const apiFetch = useCallback(
    async (path: string, init?: RequestInit): Promise<Response> => {
      if (!hasApiKey) {
        return authedFetch(path, init);
      }
      const headers = new Headers(init?.headers);
      if (!headers.has("Content-Type") && init?.body) {
        headers.set("Content-Type", "application/json");
      }
      headers.set("Authorization", `Bearer ${activeSecret}`);
      // Não envia X-Public-Key: a secret sozinha autentica
      // (pk_ divergente após rotacionar quebrava a auth).
      return fetch(path, {
        ...init,
        headers,
        credentials: "include",
      });
    },
    [hasApiKey, activeSecret]
  );

  const loadCredentials = useCallback(async () => {
    try {
      const res = await authedFetch("/api/v1/api-credentials");
      if (!res.ok) {
        setCredsLoaded(true);
        return;
      }
      const json = (await res.json()) as { items?: AccountCred[] };
      const items = (json.items ?? []).filter((c) => c.active !== false);
      const secrets = loadSessionSecrets();
      const withSecrets = items.map((c) => ({
        ...c,
        secretKey: c.secretKey || secrets[c.id] || null,
      }));
      setCreds(withSecrets);

      const preferred =
        withSecrets.find((c) => c.secretKey && isFullApiSecret(c.secretKey)) ||
        withSecrets[0];
      if (preferred) {
        setSelectedCredId(preferred.id);
        const fromSession = preferred.secretKey || "";
        const saved = loadPlaygroundSecret();
        // só preenche se for secret completa (não máscara curta)
        if (isFullApiSecret(fromSession)) {
          setSecretKey(fromSession);
          savePlaygroundSecret(fromSession);
        } else if (isFullApiSecret(saved)) {
          setSecretKey(saved);
        } else if (saved && !isFullApiSecret(saved)) {
          // limpa lixo / máscara salva por engano
          savePlaygroundSecret("");
        }
      }
    } catch {
      /* ignore */
    } finally {
      setCredsLoaded(true);
    }
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const res = await authedFetch("/api/v1/auth/me");
      if (!res.ok) return;
      const json = (await res.json()) as {
        name?: string;
        email?: string;
        id?: string;
        user?: { name?: string; email?: string; id?: string };
      };
      const u = json.user ?? json;
      if (u?.id || u?.email || u?.name) {
        setAccountLabel(
          [u.name, u.email].filter(Boolean).join(" · ") || u.id || ""
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/payments");
      if (!res.ok) return;
      const json = (await res.json()) as { items?: PaymentCharge[] };
      setList(json.items ?? []);
    } catch {
      /* ignore */
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadCredentials();
    void loadMe();
  }, [loadCredentials, loadMe]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    let cancelled = false;
    setQrImage(null);
    if (!result?.pix) return;
    void resolvePixQrImage(result.pix).then((url) => {
      if (!cancelled) setQrImage(url);
    });
    return () => {
      cancelled = true;
    };
  }, [result]);

  const syncPayment = useCallback(
    async (chargeId: string, silent = false) => {
      if (!silent) {
        setSyncing(true);
        setError(null);
      }
      try {
        const res = await apiFetch(
          `/api/v1/payments/${encodeURIComponent(chargeId)}/sync`,
          { method: "POST" }
        );
        const json = (await res.json()) as CreateResult & {
          error?: string | { message?: string };
          message?: string;
          amount?: number;
        };
        if (!res.ok) {
          const errObj = json.error;
          const errMsg =
            typeof errObj === "object" && errObj
              ? errObj.message || "Erro"
              : errObj || "Falha ao verificar pagamento";
          if (!silent) throw new Error(errMsg);
          return;
        }

        const becamePaid =
          json.status === "paid" || json.status === "aprovada";

        // Lê estado atual sem side-effect no setState (evita double-fire)
        setResult((prev) => {
          if (prev && prev.id === chargeId) {
            return {
              ...prev,
              status: json.status,
              paidAt: json.paidAt,
              message: json.message || prev.message,
            };
          }
          return prev;
        });

        // Notificação + som só na transição pendente → pago
        // (emitSaleEvent tem dedupe por id; não dispara “do nada”)
        if (becamePaid) {
          const prev = resultRef.current;
          const wasPending =
            prev?.id === chargeId &&
            prev.status !== "paid" &&
            prev.status !== "aprovada";
          if (wasPending) {
            emitSaleEvent({
              kind: "aprovada",
              amount: json.amount ?? prev.amount ?? 0,
              customer: undefined,
              product: prev.message,
              id: chargeId,
            });
          }
        }
        await refreshList();
      } catch (e) {
        if (!silent) {
          setError(
            e instanceof Error ? e.message : "Falha ao verificar pagamento"
          );
        }
      } finally {
        if (!silent) setSyncing(false);
      }
    },
    [apiFetch, refreshList]
  );

  // Polling real: enquanto PIX pendente, consulta a adquirente a cada 8s
  useEffect(() => {
    if (!result?.id) return;
    if (result.status !== "waiting_payment" && result.status !== "pending") {
      return;
    }
    const id = result.id;
    const t = window.setInterval(() => {
      void syncPayment(id, true);
    }, 8000);
    // primeira checagem após 5s (tempo de o usuário abrir o banco)
    const first = window.setTimeout(() => void syncPayment(id, true), 5000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(first);
    };
  }, [result?.id, result?.status, syncPayment]);

  // ao trocar credencial, se tiver secret completa na sessão, preenche
  useEffect(() => {
    if (!selected) return;
    if (selected.secretKey && isFullApiSecret(selected.secretKey)) {
      setSecretKey(selected.secretKey);
      savePlaygroundSecret(selected.secretKey);
    }
  }, [selected?.id, selected?.secretKey]);

  async function create() {
    setError(null);
    setLoading(true);
    setResult(null);
    setQrImage(null);
    setCopied(false);
    try {
      // Máscara no campo: limpa e usa só a sessão do painel
      if (secretLooksMasked) {
        setSecretKey("");
        savePlaygroundSecret("");
      } else if (hasApiKey) {
        savePlaygroundSecret(activeSecret);
        if (
          selected &&
          !selected.permissions.includes("transacoes") &&
          selected.permissions.length > 0
        ) {
          throw new Error(
            "Esta credencial não tem permissão de Transações. Edite em Integrações → API."
          );
        }
      }

      const n = Number(amount.replace(",", "."));
      if (!Number.isFinite(n) || n < 1) {
        throw new Error("Valor mínimo: R$ 1,00");
      }

      const body = JSON.stringify({
        amount: n,
        description,
        customerName,
        customerDocument: customerDocument.replace(/\D/g, ""),
        customerEmail,
        customerPhone: customerPhone.replace(/\D/g, ""),
        metadata: {
          source: "playground",
          credentialPublicKey: selected?.publicKey || "",
        },
      });

      // Com sk_ completa tenta API key (+ cookie fallback).
      // Sem sk_ ou com máscara: só sessão do painel (logado).
      const res =
        hasApiKey && !secretLooksMasked
          ? await apiFetch("/api/v1/payments", { method: "POST", body })
          : await authedFetch("/api/v1/payments", { method: "POST", body });

      const json = (await res.json()) as CreateResult & {
        error?: string | { code?: string; message?: string };
        hint?: string;
      };
      if (!res.ok) {
        const errObj = json.error;
        const errMsg =
          typeof errObj === "object" && errObj
            ? errObj.message || errObj.code || "Erro"
            : errObj || "Falha ao criar cobrança";
        const msg = json.hint ? `${errMsg}. ${json.hint}` : String(errMsg);
        if (res.status === 401) {
          throw new Error(
            msg ||
              "Não autenticado. Faça login de novo ou cole a secret completa de Integrações → API."
          );
        }
        throw new Error(msg);
      }
      setResult(json);
      // Notificação real: cobrança PIX gerada nesta sessão de Pagamentos
      emitSaleEvent({
        kind: "gerada",
        amount: json.amount,
        customer: customerName || undefined,
        product: description || undefined,
        id: json.id,
      });
      await refreshList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar cobrança");
    } finally {
      setLoading(false);
    }
  }

  async function copyPix() {
    const text =
      result?.pix?.copyPaste ||
      (result?.pix?.qrCode?.startsWith("000201")
        ? result.pix.qrCode
        : undefined);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="flex flex-col" style={{ gap: 18, maxWidth: 760 }}>
      <div>
        <h1
          className="font-bold"
          style={{ fontSize: 22, color: "var(--text-1)", margin: 0 }}
        >
          API de pagamentos (PIX)
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13.5,
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          Cobranças{" "}
          <strong style={{ color: "var(--text-1)" }}>PIX reais</strong> (sem
          simulação) com a <code style={{ fontSize: 12 }}>sk_</code> da sua
          conta, mesmo fluxo do cassino/checkout.
          {accountLabel ? (
            <>
              {" "}
              Conta:{" "}
              <strong style={{ color: "var(--text-1)" }}>{accountLabel}</strong>
            </>
          ) : null}
        </p>
      </div>

      {/* Credenciais da conta */}
      <div
        className="surface-card flex flex-col"
        style={{
          padding: 18,
          borderRadius: "var(--radius-card)",
          gap: 12,
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text-1)",
              }}
            >
              Credencial da sua conta
            </h2>
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 12.5,
                color: "var(--text-3)",
                lineHeight: 1.4,
              }}
            >
              Use a <code>pk_</code> / <code>sk_</code> gerada em Integrações →
              API. A secret completa só aparece ao criar/rotacionar. Copie na
              hora (a máscara curta não funciona na API).
            </p>
          </div>
          <Link
            href="/integracoes/api"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-1)",
              whiteSpace: "nowrap",
            }}
          >
            Gerenciar credenciais →
          </Link>
        </div>

        {!credsLoaded ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-3)" }}>
            Carregando credenciais…
          </p>
        ) : creds.length === 0 ? (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-app)",
              border: "1px solid var(--border-card)",
              fontSize: 13.5,
              color: "var(--text-2)",
              lineHeight: 1.45,
            }}
          >
            Você ainda não tem credencial de API.{" "}
            <Link
              href="/integracoes/api"
              style={{ color: "var(--text-1)", fontWeight: 600 }}
            >
              Criar em Integrações → API
            </Link>{" "}
            (copie a <code>sk_live_…</code> na hora) e volte aqui.
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1.5">
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                Credencial
              </span>
              <select
                value={selectedCredId}
                onChange={(e) => setSelectedCredId(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {creds.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.publicKey.slice(0, 18)}…
                    {c.env === "test" ? " (test)" : " (live)"}
                  </option>
                ))}
              </select>
            </label>

            {selected ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-card)",
                  fontSize: 12.5,
                  color: "var(--text-2)",
                  lineHeight: 1.5,
                }}
              >
                <div>
                  <strong style={{ color: "var(--text-1)" }}>
                    Chave pública:
                  </strong>{" "}
                  <code style={{ wordBreak: "break-all" }}>
                    {selected.publicKey}
                  </code>
                </div>
                <div>
                  <strong style={{ color: "var(--text-1)" }}>
                    Permissões:
                  </strong>{" "}
                  {selected.permissions.join(", ") || "-"}
                </div>
              </div>
            ) : null}

            <label className="flex flex-col gap-1.5">
              <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                Chave privada (sk_live_… / sk_test_…)
              </span>
              <div className="flex gap-2 items-center">
                <input
                  type={showSecret ? "text" : "password"}
                  value={secretKey}
                  onChange={(e) => {
                    setSecretKey(e.target.value);
                    savePlaygroundSecret(e.target.value);
                  }}
                  placeholder="Cole a sk_ da sua conta (mostrada ao criar/rotacionar)"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ ...inputStyle, flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((s) => !s)}
                  style={{ ...btnGhost, alignSelf: "stretch", height: 42 }}
                >
                  {showSecret ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <span
                style={{
                  fontSize: 11.5,
                  color: secretLooksMasked
                    ? "#f87171"
                    : hasApiKey
                      ? "#4ade80"
                      : "var(--text-3)",
                }}
              >
                {secretLooksMasked
                  ? "Isso é máscara, não a secret. Limpamos e usamos sua sessão logada. Para testar com sk_, rotacione em Integrações → API e cole a chave completa."
                  : hasApiKey
                    ? "✓ Secret completa. Auth por API key (com fallback da sessão)."
                    : "Opcional: cole a sk_ completa. Sem ela, o teste usa sua sessão logada no painel."}
              </span>
            </label>
          </>
        )}
      </div>

      {error ? (
        <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{error}</p>
      ) : null}

      <div
        className="surface-card flex flex-col"
        style={{
          padding: 20,
          borderRadius: "var(--radius-card)",
          gap: 12,
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>Valor (R$)</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            Descrição / produto
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={inputStyle}
          />
        </label>
        <div
          className="grid"
          style={{ gap: 10, gridTemplateColumns: "1fr 1fr" }}
        >
          <label className="flex flex-col gap-1.5">
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>
              Nome do pagador
            </span>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>
              CPF (só dígitos)
            </span>
            <input
              value={customerDocument}
              onChange={(e) => setCustomerDocument(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>E-mail</span>
            <input
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>Telefone</span>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        <button
          type="button"
          disabled={loading || !credsLoaded}
          onClick={() => void create()}
          style={{
            ...btnPrimary,
            opacity: loading ? 0.7 : 1,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading
            ? "Gerando PIX real…"
            : hasApiKey
              ? "Criar cobrança PIX real (sk_ da conta)"
              : "Criar cobrança PIX real (sessão da conta)"}
        </button>
      </div>

      {result ? (
        <div
          className="surface-card flex flex-col"
          style={{ padding: 20, borderRadius: "var(--radius-card)", gap: 12 }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text-1)",
              }}
            >
              Cobrança criada
            </h2>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 8px",
                borderRadius: 8,
                background: "#ffffff",
                color: "#0a0f0c",
              }}
            >
              {hasApiKey ? "Via sk_ da conta" : "Via sessão"}
              {result.provider === "velana"
                ? " · Velana"
                : result.provider === "podpay"
                  ? " · PodPay"
                  : result.provider
                    ? ` · ${result.provider}`
                    : ""}
              {result.routingMode === "personalizado"
                ? " · personalizado"
                : result.routingMode
                  ? " · plataforma"
                  : ""}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>
            {result.message}
          </p>
          <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
            <div>
              <strong style={{ color: "var(--text-1)" }}>Conta:</strong>{" "}
              {result.sellerEmail || result.sellerId || "-"}
            </div>
            <div>
              <strong style={{ color: "var(--text-1)" }}>Adquirente:</strong>{" "}
              {result.provider || "-"}
              {result.routingMode ? ` (${result.routingMode})` : ""}
            </div>
            <div>
              <strong style={{ color: "var(--text-1)" }}>ID:</strong> {result.id}
            </div>
            <div>
              <strong style={{ color: "var(--text-1)" }}>TX:</strong>{" "}
              {result.transactionId || "-"}
            </div>
            <div>
              <strong style={{ color: "var(--text-1)" }}>Status:</strong>{" "}
              {result.status}
              {result.status === "waiting_payment" ||
              result.status === "pending" ? (
                <button
                  type="button"
                  onClick={() => result.id && void syncPayment(result.id)}
                  disabled={syncing}
                  style={{
                    marginLeft: 10,
                    height: 28,
                    padding: "0 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border-card)",
                    background: "var(--bg-elevated)",
                    color: "var(--text-1)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: syncing ? "wait" : "pointer",
                  }}
                >
                  {syncing ? "Verificando…" : "Já paguei? Verificar"}
                </button>
              ) : null}
            </div>
            <div>
              <strong style={{ color: "var(--text-1)" }}>Valor:</strong>{" "}
              {formatBRL(result.amount)}
            </div>
            <div>
              <strong style={{ color: "var(--text-1)" }}>Seller (sua conta):</strong>{" "}
              {result.sellerId}
            </div>
            {selected ? (
              <div>
                <strong style={{ color: "var(--text-1)" }}>pk_:</strong>{" "}
                <code style={{ fontSize: 11 }}>{selected.publicKey}</code>
              </div>
            ) : null}
          </div>

          {result.pix?.copyPaste || result.pix?.qrCode || qrImage ? (
            <div
              className="flex flex-col sm:flex-row"
              style={{
                gap: 18,
                alignItems: "stretch",
                padding: 16,
                borderRadius: "var(--radius-md)",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-card)",
              }}
            >
              <div
                className="flex flex-col items-center justify-center shrink-0"
                style={{ gap: 10 }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-2)",
                  }}
                >
                  QR Code PIX
                </span>
                <div
                  style={{
                    width: 220,
                    height: 220,
                    borderRadius: 14,
                    background: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
                    overflow: "hidden",
                  }}
                >
                  {qrImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrImage}
                      alt="QR Code PIX para pagamento"
                      width={220}
                      height={220}
                      style={{
                        width: 220,
                        height: 220,
                        objectFit: "contain",
                        display: "block",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: 12,
                        color: "#64748b",
                        padding: 16,
                        textAlign: "center",
                      }}
                    >
                      Gerando QR…
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-3)",
                    textAlign: "center",
                    maxWidth: 220,
                    lineHeight: 1.35,
                  }}
                >
                  Abra o app do banco e escaneie para pagar
                </span>
              </div>

              <div
                className="flex flex-col min-w-0"
                style={{ flex: 1, gap: 10 }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-2)",
                  }}
                >
                  PIX copia e cola
                </span>
                <textarea
                  readOnly
                  value={
                    result.pix?.copyPaste ||
                    (result.pix?.qrCode?.startsWith("000201")
                      ? result.pix.qrCode
                      : "") ||
                    ""
                  }
                  rows={7}
                  style={{
                    ...inputStyle,
                    flex: 1,
                    minHeight: 140,
                    height: "auto",
                    padding: 12,
                    fontSize: 11,
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    resize: "vertical",
                    lineHeight: 1.45,
                  }}
                />
                <button
                  type="button"
                  style={{
                    ...btnGhost,
                    background: copied ? "#22c55e" : "var(--bg-elevated)",
                    color: copied ? "#ffffff" : "var(--text-1)",
                    border: copied ? "none" : "1px solid var(--border-muted)",
                  }}
                  onClick={() => void copyPix()}
                >
                  {copied ? "Copiado!" : "Copiar código PIX"}
                </button>
              </div>
            </div>
          ) : null}

          <a
            href="/transacoes"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-1)",
            }}
          >
            Ver em Transações →
          </a>
        </div>
      ) : null}

      {list.length > 0 ? (
        <div
          className="surface-card"
          style={{ padding: 20, borderRadius: "var(--radius-card)" }}
        >
          <h2
            style={{
              margin: "0 0 12px",
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-1)",
            }}
          >
            Últimas cobranças da sua conta
          </h2>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {list.slice(0, 10).map((c) => (
              <li
                key={c.id}
                style={{
                  fontSize: 12.5,
                  color: "var(--text-2)",
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-card)",
                }}
              >
                <strong style={{ color: "var(--text-1)" }}>
                  {formatBRL(c.amount)}
                </strong>{" "}
                · {c.status} · {c.description || c.id}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 14px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-card)",
  background: "var(--bg-app)",
  color: "var(--text-1)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const btnPrimary: CSSProperties = {
  height: 42,
  padding: "0 18px",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "#ffffff",
  color: "#0a0f0c",
  fontSize: 13.5,
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost: CSSProperties = {
  height: 40,
  padding: "0 16px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-muted)",
  background: "var(--bg-elevated)",
  color: "var(--text-1)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  alignSelf: "flex-start",
};
