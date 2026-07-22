"use client";

import { useEffect, useState } from "react";
import { IconPixFilled } from "@/components/dashboard/KpiIcons";
import { authedFetch } from "@/lib/client/session";
import { formatBRL } from "@/lib/format";

type FeePlan = {
  mdrPercent: number;
  mdrFixed: number;
  saquePercent: number;
  saqueFixed: number;
};

function formatPct(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Taxas da conta do seller — mesmas salvas no Admin → Usuário.
 * MDR (Pix) descontado em cada venda aprovada; saque no momento do saque.
 */
export function TaxasView() {
  const [fees, setFees] = useState<FeePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authedFetch("/api/v1/finance");
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error || "Não foi possível carregar as taxas");
        }
        const json = (await res.json()) as {
          fees?: Partial<FeePlan>;
        };
        if (cancelled) return;
        setFees({
          mdrPercent: Number(json.fees?.mdrPercent) || 0,
          mdrFixed: Number(json.fees?.mdrFixed) || 0,
          saquePercent: Number(json.fees?.saquePercent) || 0,
          saqueFixed: Number(json.fees?.saqueFixed) || 0,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar");
          // fallback visual padrão plataforma
          setFees({
            mdrPercent: 3,
            mdrFixed: 0.15,
            saquePercent: 3,
            saqueFixed: 0,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const mdr = fees ?? { mdrPercent: 3, mdrFixed: 0.15, saquePercent: 3, saqueFixed: 0 };
  const exampleAmount = 100;
  const exampleFee =
    Math.round(
      ((exampleAmount * mdr.mdrPercent) / 100 + mdr.mdrFixed) * 100
    ) / 100;
  const exampleNet = Math.round((exampleAmount - exampleFee) * 100) / 100;

  return (
    <div className="flex flex-col w-full min-w-0" style={{ gap: 16 }}>
      <div>
        <h1
          className="font-semibold"
          style={{ fontSize: 18, color: "var(--text-1)", margin: 0 }}
        >
          Minhas taxas
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-3)" }}>
          Plano da sua conta. O MDR é descontado automaticamente em cada venda
          aprovada; a taxa de saque no momento do saque.
        </p>
      </div>

      {error ? (
        <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{error}</p>
      ) : null}

      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 420px))",
          gap: 16,
        }}
      >
        {/* Card Pix D+0 — MDR da conta */}
        <article
          className="surface-card relative flex flex-col"
          style={{
            padding: "22px 22px 20px",
            borderRadius: "var(--radius-card)",
            minHeight: 200,
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2
              className="font-bold"
              style={{ fontSize: 18, color: "var(--green-use)" }}
            >
              Pix D+0
            </h2>
            <span
              className="flex shrink-0 items-center justify-center"
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "var(--bg-card-inner-icon)",
              }}
            >
              <IconPixFilled size={22} />
            </span>
          </div>

          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--text-2)",
              marginBottom: 18,
              maxWidth: 340,
            }}
          >
            Taxa de venda (MDR) da sua conta. Descontada sobre cada pagamento
            PIX aprovado antes de creditar o saldo disponível.
          </p>

          <p
            className="font-bold tabular"
            style={{
              fontSize: 16,
              color: "var(--green-use)",
              marginBottom: 10,
            }}
          >
            {loading ? "…" : `${formatPct(mdr.mdrPercent)}% + ${formatBRL(mdr.mdrFixed)}`}{" "}
            <span
              className="font-medium"
              style={{ fontSize: 13, color: "var(--text-2)" }}
            >
              / transação
            </span>
          </p>

          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: "auto" }}>
            Reserva financeira por 0 dias · Ex.: venda de{" "}
            {formatBRL(exampleAmount)} → líquido ≈ {formatBRL(exampleNet)}
          </p>
        </article>

        {/* Card saque */}
        <article
          className="surface-card relative flex flex-col"
          style={{
            padding: "22px 22px 20px",
            borderRadius: "var(--radius-card)",
            minHeight: 200,
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2
              className="font-bold"
              style={{ fontSize: 18, color: "var(--text-1)" }}
            >
              Saque PIX
            </h2>
          </div>

          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--text-2)",
              marginBottom: 18,
              maxWidth: 340,
            }}
          >
            Taxa cobrada quando você solicita saque do saldo disponível.
          </p>

          <p
            className="font-bold tabular"
            style={{
              fontSize: 16,
              color: "var(--text-1)",
              marginBottom: 10,
            }}
          >
            {loading
              ? "…"
              : `${formatPct(mdr.saquePercent)}% + ${formatBRL(mdr.saqueFixed)}`}{" "}
            <span
              className="font-medium"
              style={{ fontSize: 13, color: "var(--text-2)" }}
            >
              / saque
            </span>
          </p>

          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: "auto" }}>
            Configurada pelo administrador da plataforma para a sua conta.
          </p>
        </article>
      </div>
    </div>
  );
}
