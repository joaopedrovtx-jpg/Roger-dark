import { NextResponse } from "next/server";
import { markChargePaid } from "@/lib/services/payment.service";

/**
 * POST /api/v1/payments/:id/simulate-pay
 * SOMENTE com ALLOW_MOCK_DATA=1 (dev). Pagamentos reais usam webhook/sync PodPay.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (process.env.ALLOW_MOCK_DATA !== "1") {
    return NextResponse.json(
      {
        error:
          "Simulação desativada. Use pagamento real PIX; o status atualiza via webhook PodPay ou POST /api/v1/payments/:id/sync.",
      },
      { status: 403 }
    );
  }

  try {
    const { id } = await ctx.params;
    const charge = markChargePaid(id);
    return NextResponse.json({
      id: charge.id,
      status: charge.status,
      paidAt: charge.paidAt,
      transactionId: charge.transactionId,
      message: "Pagamento simulado com sucesso (ALLOW_MOCK_DATA)",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
