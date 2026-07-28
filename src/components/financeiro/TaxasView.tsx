"use client";

import { useEffect, useState } from "react";
import { IconPixFilled } from "@/components/dashboard/KpiIcons";
import { authedFetch } from "@/lib/client/session";
import { feeNumber, formatFeeLabel } from "@/lib/format";

type FeePlan = {
  /** Entradas PIX (Admin → mdrPercent / mdrFixed) */
  mdrPercent: number;
  mdrFixed: number;
  /** Saque (Admin → saquePercent / saqueFixed) */
  saquePercent: number;
  saqueFixed: number;
};

/**
 * Taxas da conta do seller — espelho do que o admin configurou
 * em Admin → Usuários → Taxas (por conta).
 *
 * PIX D+0 (por transação): mdrPercent + mdrFixed
 * Saque PIX: saquePercent + saqueFixed
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
          mdrPercent: feeNumber(json.fees?.mdrPercent, 0),
          mdrFixed: feeNumber(json.fees?.mdrFixed, 0),
          saquePercent: feeNumber(json.fees?.saquePercent, 0),
          saqueFixed: feeNumber(json.fees?.saqueFixed, 0),
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar");
          setFees({
            mdrPercent: 0,
            mdrFixed: 0,
            saquePercent: 0,
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

  const plan = fees ?? {
    mdrPercent: 0,
    mdrFixed: 0,
    saquePercent: 0,
    saqueFixed: 0,
  };

  const pixLabel = formatFeeLabel(plan.mdrPercent, plan.mdrFixed);
  const saqueLabel = formatFeeLabel(plan.saquePercent, plan.saqueFixed);

  return (
    <div className="flex flex-col w-full min-w-0" style={{ gap: 16 }}>
      <div>
        <h1
          className="font-semibold"
          style={{ fontSize: 18, color: "var(--text-1)", margin: 0 }}
        >
          Minhas taxas
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: "var(--text-3)",
            lineHeight: 1.4,
          }}
        >
          Taxas da sua conta (configuradas pela plataforma).
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
        {/* Card Pix D+0 — plano da conta (mdr) */}
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
            Taxa cobrada em cada venda PIX recebida (por transação).
          </p>

          <p
            className="font-bold tabular"
            style={{
              fontSize: 16,
              color: "var(--green-use)",
              marginBottom: 6,
            }}
          >
            {loading ? "…" : pixLabel}{" "}
            <span
              className="font-medium"
              style={{ fontSize: 13, color: "var(--text-2)" }}
            >
              / transação
            </span>
          </p>

          {!loading && (plan.mdrPercent > 0 || plan.mdrFixed > 0) ? (
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "var(--text-3)",
                lineHeight: 1.4,
              }}
            >
              {plan.mdrPercent > 0 && plan.mdrFixed > 0
                ? `${plan.mdrPercent.toLocaleString("pt-BR", {
                    maximumFractionDigits: 4,
                  })}% do valor + valor fixo por venda.`
                : plan.mdrPercent > 0
                  ? "Percentual sobre o valor de cada venda."
                  : "Valor fixo por venda recebida."}
            </p>
          ) : null}
        </article>

        {/* Card saque — plano da conta */}
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
              marginBottom: 6,
            }}
          >
            {loading ? "…" : saqueLabel}{" "}
            <span
              className="font-medium"
              style={{ fontSize: 13, color: "var(--text-2)" }}
            >
              / saque
            </span>
          </p>

          {!loading && (plan.saquePercent > 0 || plan.saqueFixed > 0) ? (
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "var(--text-3)",
                lineHeight: 1.4,
              }}
            >
              {plan.saquePercent > 0 && plan.saqueFixed > 0
                ? "Descontada do valor solicitado no saque."
                : plan.saquePercent > 0
                  ? "Percentual descontado do valor solicitado."
                  : "Valor fixo descontado de cada saque."}
            </p>
          ) : null}
        </article>
      </div>
    </div>
  );
}
