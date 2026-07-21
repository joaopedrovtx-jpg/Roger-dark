import { NextResponse } from "next/server";
import { markChargePaid } from "@/lib/services/payment-write.service";
import { getChargeAsync } from "@/lib/services/payment-read.service";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import { securityHeaders } from "@/lib/server/security";

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
    // Carrega ANTES de mutar para checar seller e evitar leak de dados
    // entre sellers que conheçam o ID da cobrança.
    const existing = await getChargeAsync(id, gate.user.id);
    if (!existing) {
      return NextResponse.json(
        { error: "Cobrança não encontrada" },
        { status: 404, headers: securityHeaders() }
      );
    }
    if (
      existing.sellerId !== gate.user.id &&
      !gate.user.roles.includes("admin")
    ) {
      return NextResponse.json(
        { error: "Sem permissão para esta cobrança" },
        { status: 403, headers: securityHeaders() }
      );
    }
    const charge = markChargePaid(id);
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
