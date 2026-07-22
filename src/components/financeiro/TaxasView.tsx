"use client";

import { useEffect, useState } from "react";
import { IconPixFilled } from "@/components/dashboard/KpiIcons";
import { authedFetch } from "@/lib/client/session";
import { formatBRL } from "@/lib/format";

type FeePlan = {
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
 * Taxas exibidas ao seller.
 * Pix: até R$ 50 = R$ 1,00 fixo; acima = 3% (regra da plataforma).
 * Saque: plano da conta (Admin).
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
          saquePercent: Number(json.fees?.saquePercent) || 0,
          saqueFixed: Number(json.fees?.saqueFixed) || 0,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar");
          setFees({
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

  const saque = fees ?? { saquePercent: 3, saqueFixed: 0 };

  return (
    <div className="flex flex-col w-full min-w-0" style={{ gap: 16 }}>
      <div>
        <h1
          className="font-semibold"
          style={{ fontSize: 18, color: "var(--text-1)", margin: 0 }}
        >
          Minhas taxas
        </h1>
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
        {/* Card Pix D+0 — faixas por valor */}
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
              marginBottom: 16,
              maxWidth: 340,
            }}
          >
            PIX é o meio de pagamento instantâneo da plataforma.
          </p>

          {/* Duas faixas na mesma linha */}
          <div
            className="flex items-start"
            style={{
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 140px", minWidth: 0 }}>
              <p
                className="font-bold tabular"
                style={{
                  margin: 0,
                  fontSize: 16,
                  color: "var(--green-use)",
                  whiteSpace: "nowrap",
                }}
              >
                R$&nbsp;1,00{" "}
                <span
                  className="font-medium"
                  style={{ fontSize: 13, color: "var(--text-2)" }}
                >
                  / transação
                </span>
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 13,
                  color: "var(--text-3)",
                }}
              >
                abaixo de R$&nbsp;50
              </p>
            </div>

            <div style={{ flex: "1 1 140px", minWidth: 0 }}>
              <p
                className="font-bold tabular"
                style={{
                  margin: 0,
                  fontSize: 16,
                  color: "var(--green-use)",
                  whiteSpace: "nowrap",
                }}
              >
                3,00%{" "}
                <span
                  className="font-medium"
                  style={{ fontSize: 13, color: "var(--text-2)" }}
                >
                  / transação
                </span>
              </p>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 13,
                  color: "var(--text-3)",
                }}
              >
                acima de R$&nbsp;50
              </p>
            </div>
          </div>

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
              : `${formatPct(saque.saquePercent)}% + ${formatBRL(saque.saqueFixed)}`}{" "}
            <span
              className="font-medium"
              style={{ fontSize: 13, color: "var(--text-2)" }}
            >
              / saque
            </span>
          </p>

        </article>
      </div>
    </div>
  );
}
