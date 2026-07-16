import { AppShell } from "@/components/layout/AppShell";
import { IconPixFilled } from "@/components/dashboard/KpiIcons";

export default function TaxasPage() {
  return (
    <AppShell>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 420px))",
          gap: 16,
        }}
      >
        {/* Card Pix D+0 — taxa */}
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
            PIX é o novo meio de pagamento instantâneo da plataforma.
          </p>

          <p
            className="font-bold tabular"
            style={{
              fontSize: 16,
              color: "var(--green-use)",
              marginBottom: 10,
            }}
          >
            3,00% + R$&nbsp;0,15{" "}
            <span
              className="font-medium"
              style={{ fontSize: 13, color: "var(--text-2)" }}
            >
              / transação
            </span>
          </p>

          <p style={{ fontSize: 13, color: "var(--text-3)", marginTop: "auto" }}>
            Reserva financeira por 0 dias
          </p>
        </article>
      </div>
    </AppShell>
  );
}
