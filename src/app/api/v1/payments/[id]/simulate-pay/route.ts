import { NextResponse } from "next/server";
import { markChargePaid } from "@/lib/services/payment.service";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import { securityHeaders } from "@/lib/server/security";

/**
 * POST /api/v1/payments/:id/simulate-pay
 * SOMENTE com ALLOW_MOCK_DATA=1 (dev). Pagamentos reais usam webhook/sync.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  const { isMockAllowed } = await import("@/lib/server/security");
  if (!isMockAllowed()) {
    return NextResponse.json(
      {
        error:
          "Simulação desativada em produção. Use pagamento real PIX; status via webhook ou POST /api/v1/payments/:id/sync.",
      },
      { status: 403, headers: securityHeaders() }
    );
  }

  try {
    const { id } = await ctx.params;
    const charge = markChargePaid(id);
    // Só o dono da cobrança (ou admin) simula
    if (
      charge.sellerId !== gate.user.id &&
      !gate.user.roles.includes("admin")
    ) {
      return NextResponse.json(
        { error: "Sem permissão para esta cobrança" },
        { status: 403, headers: securityHeaders() }
      );
    }
    return NextResponse.json(
      {
        id: charge.id,
        status: charge.status,
        paidAt: charge.paidAt,
        transactionId: charge.transactionId,
        message: "Pagamento simulado com sucesso (ALLOW_MOCK_DATA)",
      },
      { headers: securityHeaders() }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: securityHeaders() }
    );
  }
}
