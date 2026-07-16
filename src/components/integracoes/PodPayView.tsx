"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  clearPodPayConfigClient,
  detectPixKeyType,
  isPodPayEnabled,
  loadPodPayConfigClient,
  onlyDigits,
  savePodPayConfigClient,
  toCents,
  type PodPayEnv,
} from "@/lib/acquirers/podpay";
import { formatBRL } from "@/lib/format";

type TabId =
  | "credenciais"
  | "saldo"
  | "pagamentos"
  | "saques"
  | "checkout"
  | "webhooks";

const TABS: { id: TabId; label: string }[] = [
  { id: "credenciais", label: "Credenciais" },
  { id: "saldo", label: "Saldo" },
  { id: "pagamentos", label: "Pagamentos" },
  { id: "saques", label: "Saques" },
  { id: "checkout", label: "Checkout" },
  { id: "webhooks", label: "Webhooks" },
];

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
  height: 40,
  padding: "0 16px",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "#ffffff",
  color: "#0a0f0c",
  fontSize: 13,
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
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-3)",
  fontWeight: 600,
};

/** Headers com chave do painel para o BFF chamar a PodPay */
function podpayHeaders(json = true): HeadersInit {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  const cfg = loadPodPayConfigClient();
  if (cfg?.apiKey) h["x-podpay-api-key"] = cfg.apiKey;
  return h;
}

async function podpayFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...podpayHeaders(init?.method !== "GET" && init?.method !== undefined),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (json as { error?: string }).error || `HTTP ${res.status}`
    );
  }
  return json as { success?: boolean; data?: unknown; error?: string };
}

/**
 * Hub PodPay — espelho da documentação docs.podpay.app
 * Credenciais · Saldo · Pagamentos · Saques · Checkout · Webhooks
 */
export function PodPayView() {
  const [tab, setTab] = useState<TabId>("credenciais");
  const [apiKey, setApiKey] = useState("");
  const [env, setEnv] = useState<PodPayEnv>("sandbox");
  const [configured, setConfigured] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Saldo
  const [balance, setBalance] = useState<{
    available: number;
    pending: number;
    held: number;
    maxAntecipable?: number;
  } | null>(null);

  // Pagamentos
  const [payAmount, setPayAmount] = useState("97.00");
  const [payName, setPayName] = useState("Cliente Demo");
  const [payEmail, setPayEmail] = useState("cliente@email.com");
  const [payPhone, setPayPhone] = useState("11999999999");
  const [payDoc, setPayDoc] = useState("52998224725");
  const [payTitle, setPayTitle] = useState("Produto teste");
  const [txId, setTxId] = useState("");
  const [payResult, setPayResult] = useState<string | null>(null);

  // Saques
  const [wdAmount, setWdAmount] = useState("50.00");
  const [wdPixKey, setWdPixKey] = useState("cliente@email.com");
  const [wdId, setWdId] = useState("");
  const [wdResult, setWdResult] = useState<string | null>(null);

  // Checkout
  const [productId, setProductId] = useState("");
  const [successUrl, setSuccessUrl] = useState("https://exemplo.com/sucesso");
  const [cancelUrl, setCancelUrl] = useState("https://exemplo.com/cancelado");
  const [sessionToken, setSessionToken] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [paymentLinkToken, setPaymentLinkToken] = useState("");
  const [checkoutResult, setCheckoutResult] = useState<string | null>(null);

  // Webhooks
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    const cfg = loadPodPayConfigClient();
    if (cfg) {
      setConfigured(true);
      setEnv(cfg.env);
      setPreview(`${cfg.apiKey.slice(0, 12)}…${cfg.apiKey.slice(-4)}`);
    } else {
      setConfigured(isPodPayEnabled());
    }
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/v1/webhooks/podpay`);
    }
  }, []);

  function clearFlash() {
    setError(null);
    setMsg(null);
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    clearFlash();
    if (!apiKey.trim()) {
      setError("Informe a API Key (sk_test_… ou sk_live_…).");
      return;
    }
    if (!apiKey.startsWith("sk_")) {
      setError("A chave deve começar com sk_test_ ou sk_live_.");
      return;
    }
    const resolvedEnv: PodPayEnv = apiKey.includes("test") ? "sandbox" : env;
    savePodPayConfigClient({
      apiKey: apiKey.trim(),
      env: resolvedEnv,
      postbackBaseUrl:
        typeof window !== "undefined" ? window.location.origin : undefined,
    });
    setConfigured(true);
    setEnv(resolvedEnv);
    setPreview(`${apiKey.trim().slice(0, 12)}…${apiKey.trim().slice(-4)}`);
    setApiKey("");
    setMsg("Credenciais PodPay salvas — use as abas para testar a API.");
  }

  function handleClear() {
    clearPodPayConfigClient();
    setConfigured(false);
    setPreview(null);
    setApiKey("");
    setBalance(null);
    setMsg("PodPay desconectada — mock local ativo.");
  }

  async function run(fn: () => Promise<void>) {
    setLoading(true);
    clearFlash();
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  // ── Saldo ────────────────────────────────────────────
  async function loadBalance() {
    await run(async () => {
      const json = await podpayFetch("/api/v1/acquirers/podpay/balance");
      const m = (json.data as { mapped?: {
        available: number;
        pending: number;
        held: number;
      }; raw?: { maxAntecipable?: number } })?.mapped;
      const raw = (json.data as { raw?: { maxAntecipable?: number } })?.raw;
      if (!m) throw new Error("Resposta de saldo inválida");
      setBalance({
        available: m.available,
        pending: m.pending,
        held: m.held,
        maxAntecipable:
          raw?.maxAntecipable != null ? raw.maxAntecipable / 100 : undefined,
      });
      setMsg("Saldo sincronizado da PodPay (GET /v1/balance/available).");
    });
  }

  // ── Pagamentos ───────────────────────────────────────
  async function createPayment() {
    await run(async () => {
      const amount = Number(payAmount.replace(",", "."));
      const cents = toCents(amount);
      if (cents < 100) throw new Error("Valor mínimo PodPay: R$ 1,00");
      const doc = onlyDigits(payDoc);
      const json = await podpayFetch("/api/v1/acquirers/podpay/transactions", {
        method: "POST",
        body: JSON.stringify({
          paymentMethod: "pix",
          amount: cents,
          customer: {
            name: payName,
            email: payEmail,
            phone: onlyDigits(payPhone),
            document: {
              type: doc.length > 11 ? "cnpj" : "cpf",
              number: doc,
            },
          },
          items: [
            {
              title: payTitle,
              unitPrice: cents,
              quantity: 1,
              tangible: false,
            },
          ],
          postbackUrl: webhookUrl || undefined,
        }),
      });
      setPayResult(JSON.stringify(json.data, null, 2));
      const id = (json.data as { id?: string })?.id;
      if (id) setTxId(id);
      setMsg("Cobrança PIX criada (POST /v1/transactions).");
    });
  }

  async function listRemotePayments() {
    await run(async () => {
      const json = await podpayFetch(
        "/api/v1/acquirers/podpay/transactions?pageSize=10"
      );
      setPayResult(JSON.stringify(json.data, null, 2));
      setMsg("Lista remota (GET /v1/transactions).");
    });
  }

  async function getPayment() {
    await run(async () => {
      if (!txId.trim()) throw new Error("Informe o ID da transação.");
      const json = await podpayFetch(
        `/api/v1/acquirers/podpay/transactions/${encodeURIComponent(txId.trim())}`
      );
      setPayResult(JSON.stringify(json.data, null, 2));
      setMsg("Transação consultada (GET /v1/transactions/{id}).");
    });
  }

  async function refundPayment() {
    await run(async () => {
      if (!txId.trim()) throw new Error("Informe o ID da transação.");
      const json = await podpayFetch(
        `/api/v1/acquirers/podpay/transactions/${encodeURIComponent(txId.trim())}/refund`,
        { method: "POST", body: "{}" }
      );
      setPayResult(JSON.stringify(json.data, null, 2));
      setMsg("Estorno solicitado (POST /v1/transactions/{id}/refund).");
    });
  }

  // ── Saques ───────────────────────────────────────────
  async function createWithdrawal() {
    await run(async () => {
      const amount = Number(wdAmount.replace(",", "."));
      const cents = toCents(amount);
      if (cents < 100) throw new Error("Valor mínimo: R$ 1,00");
      if (!wdPixKey.trim()) throw new Error("Informe a chave PIX.");
      const json = await podpayFetch("/api/v1/acquirers/podpay/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          method: "fiat",
          amount: cents,
          pixKey: wdPixKey.trim(),
          pixKeyType: detectPixKeyType(wdPixKey),
        }),
      });
      setWdResult(JSON.stringify(json.data, null, 2));
      const id = (json.data as { id?: string })?.id;
      if (id) setWdId(id);
      setMsg("Saque PIX criado (POST /v1/withdrawals).");
    });
  }

  async function listWithdrawals() {
    await run(async () => {
      const json = await podpayFetch(
        "/api/v1/acquirers/podpay/withdrawals?page=1"
      );
      setWdResult(JSON.stringify(json.data, null, 2));
      setMsg("Lista remota (GET /v1/withdrawals).");
    });
  }

  async function getWithdrawal() {
    await run(async () => {
      if (!wdId.trim()) throw new Error("Informe o ID do saque.");
      const json = await podpayFetch(
        `/api/v1/acquirers/podpay/withdrawals/${encodeURIComponent(wdId.trim())}`
      );
      setWdResult(JSON.stringify(json.data, null, 2));
      setMsg("Saque consultado (GET /v1/withdrawals/{id}).");
    });
  }

  async function cancelWithdrawal() {
    await run(async () => {
      if (!wdId.trim()) throw new Error("Informe o ID do saque.");
      const json = await podpayFetch(
        `/api/v1/acquirers/podpay/withdrawals/${encodeURIComponent(wdId.trim())}/cancel`,
        { method: "PATCH", body: "{}" }
      );
      setWdResult(JSON.stringify(json.data, null, 2));
      setMsg("Saque cancelado (PATCH /v1/withdrawals/{id}/cancel).");
    });
  }

  // ── Checkout ─────────────────────────────────────────
  async function createCheckout() {
    await run(async () => {
      if (!productId.trim()) {
        throw new Error(
          "Informe o productId do catálogo PodPay (Checkout → Produtos)."
        );
      }
      const json = await podpayFetch(
        "/api/v1/acquirers/podpay/checkout/sessions",
        {
          method: "POST",
          body: JSON.stringify({
            successUrl,
            cancelUrl,
            expiresAt: 60,
            lineItems: [
              { productId: productId.trim(), quantity: 1, sortOrder: 0 },
            ],
            metadata: { source: "darkpay" },
            postbackUrl: webhookUrl || undefined,
          }),
        }
      );
      setCheckoutResult(JSON.stringify(json.data, null, 2));
      const d = json.data as { sessionId?: string; checkoutUrl?: string };
      if (d?.sessionId) setSessionToken(d.sessionId);
      setMsg("Sessão criada (POST /v1/checkout/sessions).");
    });
  }

  async function getCheckoutSession() {
    await run(async () => {
      if (!sessionToken.trim()) throw new Error("Informe o token da sessão.");
      const json = await podpayFetch(
        `/api/v1/acquirers/podpay/checkout/sessions/${encodeURIComponent(sessionToken.trim())}`
      );
      setCheckoutResult(JSON.stringify(json.data, null, 2));
      setMsg("Sessão consultada (GET /v1/checkout/sessions/{token}).");
    });
  }

  async function applyCoupon() {
    await run(async () => {
      if (!sessionToken.trim()) throw new Error("Informe o token da sessão.");
      if (!couponCode.trim()) throw new Error("Informe o código do cupom.");
      const json = await podpayFetch(
        `/api/v1/acquirers/podpay/checkout/sessions/${encodeURIComponent(sessionToken.trim())}/coupon`,
        {
          method: "POST",
          body: JSON.stringify({ code: couponCode.trim() }),
        }
      );
      setCheckoutResult(JSON.stringify(json.data, null, 2));
      setMsg("Cupom aplicado (POST …/sessions/{token}/coupon).");
    });
  }

  async function payCheckout() {
    await run(async () => {
      if (!sessionToken.trim()) throw new Error("Informe o token da sessão.");
      const doc = onlyDigits(payDoc);
      const json = await podpayFetch(
        `/api/v1/acquirers/podpay/checkout/sessions/${encodeURIComponent(sessionToken.trim())}/pay`,
        {
          method: "POST",
          body: JSON.stringify({
            customer: {
              name: payName,
              email: payEmail,
              phone: onlyDigits(payPhone),
              document: {
                type: doc.length > 11 ? "cnpj" : "cpf",
                number: doc,
              },
            },
          }),
        }
      );
      setCheckoutResult(JSON.stringify(json.data, null, 2));
      setMsg("PIX gerado no checkout (POST …/sessions/{token}/pay).");
    });
  }

  async function openPaymentLink() {
    await run(async () => {
      if (!paymentLinkToken.trim()) {
        throw new Error("Informe o publicToken do payment link PodPay.");
      }
      const json = await podpayFetch(
        `/api/v1/acquirers/podpay/checkout/payment-links/${encodeURIComponent(paymentLinkToken.trim())}/sessions`,
        { method: "POST", body: "{}" }
      );
      setCheckoutResult(JSON.stringify(json.data, null, 2));
      const d = json.data as { sessionId?: string };
      if (d?.sessionId) setSessionToken(d.sessionId);
      setMsg("Sessão aberta do payment link.");
    });
  }

  return (
    <div className="flex flex-col" style={{ gap: 16, maxWidth: 760 }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1
            className="font-bold"
            style={{ fontSize: 22, color: "var(--text-1)", margin: 0 }}
          >
            PodPay
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13.5,
              color: "var(--text-2)",
              lineHeight: 1.45,
            }}
          >
            Hub completo da documentação —{" "}
            <a
              href="https://docs.podpay.app/"
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--text-1)", fontWeight: 600 }}
            >
              docs.podpay.app
            </a>
            {" · "}
            saldo, pagamentos, saques, checkout e webhooks.
          </p>
        </div>
        <span
          className="inline-flex items-center justify-center font-semibold"
          style={{
            height: 24,
            padding: "0 9px",
            borderRadius: 8,
            background: configured ? "#ffffff" : "var(--bg-elevated)",
            color: configured ? "#0a0f0c" : "var(--text-2)",
            fontSize: 11,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          {configured ? "Ativo" : "Mock"}
        </span>
      </div>

      {/* Abas */}
      <div
        className="inline-flex items-center self-start flex-wrap"
        style={{
          padding: 4,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-card)",
          gap: 2,
        }}
        role="tablist"
      >
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setTab(t.id);
                clearFlash();
              }}
              style={{
                height: 34,
                padding: "0 12px",
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: on ? 650 : 500,
                background: on ? "var(--bg-card)" : "transparent",
                color: on ? "var(--text-1)" : "var(--text-2)",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{error}</p>
      ) : null}
      {msg ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-1)" }}>{msg}</p>
      ) : null}

      {/* ── Credenciais ── */}
      {tab === "credenciais" ? (
        <Card>
          <SectionTitle>Autenticação (x-api-key)</SectionTitle>
          <p style={hintStyle}>
            Sandbox: <code>sandbox.podpay.app</code> + <code>sk_test_…</code>
            <br />
            Produção: <code>api.podpay.app</code> + <code>sk_live_…</code>
            <br />
            Valores na PodPay são em <strong>centavos</strong> (R$ 1,00 = 100).
          </p>
          <form onSubmit={handleSave} className="flex flex-col" style={{ gap: 14 }}>
            <Field label="API Key (x-api-key)">
              <input
                type="password"
                autoComplete="off"
                placeholder="sk_test_… ou sk_live_…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Ambiente">
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value as PodPayEnv)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="sandbox">Sandbox — sandbox.podpay.app</option>
                <option value="live">Produção — api.podpay.app</option>
              </select>
            </Field>
            {preview ? (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-3)" }}>
                Chave salva: {preview}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="submit" style={btnPrimary}>
                Salvar chave
              </button>
              {configured ? (
                <button type="button" style={btnGhost} onClick={handleClear}>
                  Desconectar
                </button>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}

      {/* ── Saldo ── */}
      {tab === "saldo" ? (
        <Card>
          <SectionTitle>GET /v1/balance/available</SectionTitle>
          <p style={hintStyle}>
            <code>amount</code> → disponível · <code>waitingFunds</code> → a
            liberar · <code>reserve</code> → retido ·{" "}
            <code>maxAntecipable</code> → antecipável
          </p>
          <button
            type="button"
            style={btnPrimary}
            disabled={loading}
            onClick={() => void loadBalance()}
          >
            {loading ? "Buscando…" : "Consultar saldo PodPay"}
          </button>
          {balance ? (
            <div
              className="grid"
              style={{
                marginTop: 16,
                gap: 10,
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              }}
            >
              <Stat label="Disponível" value={formatBRL(balance.available)} />
              <Stat label="A liberar" value={formatBRL(balance.pending)} />
              <Stat label="Reserva / retido" value={formatBRL(balance.held)} />
              <Stat
                label="Máx. antecipável"
                value={
                  balance.maxAntecipable != null
                    ? formatBRL(balance.maxAntecipable)
                    : "—"
                }
              />
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ── Pagamentos ── */}
      {tab === "pagamentos" ? (
        <div className="flex flex-col" style={{ gap: 14 }}>
          <Card>
            <SectionTitle>POST /v1/transactions (PIX)</SectionTitle>
            <p style={hintStyle}>
              Cria cobrança PIX direto na PodPay. Lista / consulta / estorno
              abaixo.
            </p>
            <div
              className="grid"
              style={{ gap: 10, gridTemplateColumns: "1fr 1fr" }}
            >
              <Field label="Valor (R$)">
                <input
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Produto">
                <input
                  value={payTitle}
                  onChange={(e) => setPayTitle(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Cliente">
                <input
                  value={payName}
                  onChange={(e) => setPayName(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="E-mail">
                <input
                  value={payEmail}
                  onChange={(e) => setPayEmail(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Telefone">
                <input
                  value={payPhone}
                  onChange={(e) => setPayPhone(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="CPF (só dígitos)">
                <input
                  value={payDoc}
                  onChange={(e) => setPayDoc(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              <button
                type="button"
                style={btnPrimary}
                disabled={loading}
                onClick={() => void createPayment()}
              >
                Criar cobrança PIX
              </button>
              <button
                type="button"
                style={btnGhost}
                disabled={loading}
                onClick={() => void listRemotePayments()}
              >
                Listar vendas
              </button>
            </div>
          </Card>

          <Card>
            <SectionTitle>
              GET / POST refund · /v1/transactions/&#123;id&#125;
            </SectionTitle>
            <Field label="ID da transação PodPay">
              <input
                value={txId}
                onChange={(e) => setTxId(e.target.value)}
                placeholder="tx_…"
                style={inputStyle}
              />
            </Field>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              <button
                type="button"
                style={btnPrimary}
                disabled={loading}
                onClick={() => void getPayment()}
              >
                Consultar
              </button>
              <button
                type="button"
                style={btnGhost}
                disabled={loading}
                onClick={() => void refundPayment()}
              >
                Estornar
              </button>
            </div>
            {payResult ? <Pre>{payResult}</Pre> : null}
          </Card>
        </div>
      ) : null}

      {/* ── Saques ── */}
      {tab === "saques" ? (
        <div className="flex flex-col" style={{ gap: 14 }}>
          <Card>
            <SectionTitle>POST /v1/withdrawals (fiat / PIX)</SectionTitle>
            <p style={hintStyle}>
              Saque em reais via chave PIX. Valores em centavos na API; aqui em
              R$. Status: pending → processing → completed | failed | canceled.
            </p>
            <div
              className="grid"
              style={{ gap: 10, gridTemplateColumns: "1fr 1fr" }}
            >
              <Field label="Valor (R$)">
                <input
                  value={wdAmount}
                  onChange={(e) => setWdAmount(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Chave PIX">
                <input
                  value={wdPixKey}
                  onChange={(e) => setWdPixKey(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
            <p style={{ ...hintStyle, marginTop: 8, marginBottom: 0 }}>
              Tipo detectado:{" "}
              <strong>{detectPixKeyType(wdPixKey || "x")}</strong>
            </p>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              <button
                type="button"
                style={btnPrimary}
                disabled={loading}
                onClick={() => void createWithdrawal()}
              >
                Criar saque PIX
              </button>
              <button
                type="button"
                style={btnGhost}
                disabled={loading}
                onClick={() => void listWithdrawals()}
              >
                Listar saques
              </button>
            </div>
          </Card>

          <Card>
            <SectionTitle>
              GET / PATCH cancel · /v1/withdrawals/&#123;id&#125;
            </SectionTitle>
            <Field label="ID do saque PodPay">
              <input
                value={wdId}
                onChange={(e) => setWdId(e.target.value)}
                placeholder="wd_…"
                style={inputStyle}
              />
            </Field>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              <button
                type="button"
                style={btnPrimary}
                disabled={loading}
                onClick={() => void getWithdrawal()}
              >
                Consultar
              </button>
              <button
                type="button"
                style={btnGhost}
                disabled={loading}
                onClick={() => void cancelWithdrawal()}
              >
                Cancelar
              </button>
            </div>
            {wdResult ? <Pre>{wdResult}</Pre> : null}
          </Card>
        </div>
      ) : null}

      {/* ── Checkout ── */}
      {tab === "checkout" ? (
        <div className="flex flex-col" style={{ gap: 14 }}>
          <Card>
            <SectionTitle>POST /v1/checkout/sessions</SectionTitle>
            <p style={hintStyle}>
              Sessão de checkout hospedado. O <strong>productId</strong> precisa
              existir no catálogo PodPay.
            </p>
            <div className="flex flex-col" style={{ gap: 10 }}>
              <Field label="productId (catálogo PodPay)">
                <input
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  placeholder="cmp_product_id_real"
                  style={inputStyle}
                />
              </Field>
              <Field label="successUrl">
                <input
                  value={successUrl}
                  onChange={(e) => setSuccessUrl(e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="cancelUrl">
                <input
                  value={cancelUrl}
                  onChange={(e) => setCancelUrl(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              <button
                type="button"
                style={btnPrimary}
                disabled={loading}
                onClick={() => void createCheckout()}
              >
                Criar sessão
              </button>
            </div>
          </Card>

          <Card>
            <SectionTitle>Sessão · cupom · pay (PIX)</SectionTitle>
            <p style={hintStyle}>
              GET sessão · POST coupon · POST pay — endpoints da doc Checkout.
            </p>
            <div className="flex flex-col" style={{ gap: 10 }}>
              <Field label="session token / sessionId">
                <input
                  value={sessionToken}
                  onChange={(e) => setSessionToken(e.target.value)}
                  placeholder="preenchido ao criar sessão"
                  style={inputStyle}
                />
              </Field>
              <Field label="Cupom (opcional)">
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="CUPOM10"
                  style={inputStyle}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              <button
                type="button"
                style={btnPrimary}
                disabled={loading}
                onClick={() => void getCheckoutSession()}
              >
                Consultar sessão
              </button>
              <button
                type="button"
                style={btnGhost}
                disabled={loading}
                onClick={() => void applyCoupon()}
              >
                Aplicar cupom
              </button>
              <button
                type="button"
                style={btnGhost}
                disabled={loading}
                onClick={() => void payCheckout()}
              >
                Pagar (gerar PIX)
              </button>
            </div>
            <p style={{ ...hintStyle, marginTop: 10, marginBottom: 0 }}>
              Pay usa os dados de cliente da aba Pagamentos (nome, e-mail, CPF).
            </p>
          </Card>

          <Card>
            <SectionTitle>
              POST /v1/checkout/payment-links/&#123;token&#125;/sessions
            </SectionTitle>
            <p style={hintStyle}>
              Abre sessão a partir de um payment link público do dashboard
              PodPay.
            </p>
            <Field label="publicToken do payment link">
              <input
                value={paymentLinkToken}
                onChange={(e) => setPaymentLinkToken(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                style={btnPrimary}
                disabled={loading}
                onClick={() => void openPaymentLink()}
              >
                Abrir sessão do link
              </button>
            </div>
            {checkoutResult ? <Pre>{checkoutResult}</Pre> : null}
          </Card>
        </div>
      ) : null}

      {/* ── Webhooks ── */}
      {tab === "webhooks" ? (
        <Card>
          <SectionTitle>Webhooks PodPay → DarkPay</SectionTitle>
          <p style={hintStyle}>
            Configure no dashboard PodPay (e/ou em <code>postbackUrl</code> da
            cobrança/checkout) a URL abaixo. Eventos da documentação:
          </p>
          <ul
            style={{
              margin: "0 0 14px",
              paddingLeft: 18,
              fontSize: 13,
              color: "var(--text-2)",
              lineHeight: 1.55,
            }}
          >
            <li>
              <code>transaction.completed</code> / <code>failed</code> /{" "}
              <code>pending</code> / <code>refunded</code>
            </li>
            <li>
              <code>withdrawal.completed</code> / <code>failed</code> /{" "}
              <code>canceled</code>
            </li>
          </ul>

          <Field label="URL do receptor (copie para o dashboard PodPay)">
            <div className="flex gap-2">
              <input
                readOnly
                value={webhookUrl}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                style={btnPrimary}
                onClick={() => {
                  void navigator.clipboard.writeText(webhookUrl);
                  setMsg("URL copiada.");
                }}
              >
                Copiar
              </button>
            </div>
          </Field>

          <div style={{ marginTop: 14 }}>
            <code style={codeBlock}>
              POST {webhookUrl || "/api/v1/webhooks/podpay"}
              <br />
              GET {webhookUrl || "/api/v1/webhooks/podpay"} — health
              <br />
              <br />
              Payload: event, timestamp, data, signature, version, eventId,
              source
              <br />
              HMAC: signature ainda “futuro” na doc PodPay (vazio)
            </code>
          </div>

          <p style={{ ...hintStyle, marginTop: 12 }}>
            Ao receber <code>transaction.completed</code>, o DarkPay marca a
            cobrança como paga e atualiza saldo/transação no store unificado
            (seller + admin). Saques atualizam com{" "}
            <code>withdrawal.*</code>.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      className="surface-card"
      style={{
        padding: 20,
        borderRadius: "var(--radius-card)",
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        margin: "0 0 8px",
        fontSize: 15,
        fontWeight: 700,
        color: "var(--text-1)",
      }}
    >
      {children}
    </h2>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-card)",
      }}
    >
      <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{label}</div>
      <div
        className="tabular font-bold"
        style={{ fontSize: 16, color: "var(--text-1)", marginTop: 4 }}
      >
        {value}
      </div>
    </div>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre
      style={{
        marginTop: 14,
        padding: 12,
        borderRadius: 12,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-card)",
        fontSize: 11,
        color: "var(--text-2)",
        overflow: "auto",
        maxHeight: 280,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </pre>
  );
}

const hintStyle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 12.5,
  color: "var(--text-3)",
  lineHeight: 1.45,
};

const codeBlock: CSSProperties = {
  display: "block",
  padding: 12,
  borderRadius: 12,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-card)",
  fontSize: 11.5,
  color: "var(--text-2)",
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};
