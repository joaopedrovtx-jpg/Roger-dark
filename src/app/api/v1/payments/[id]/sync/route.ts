import { NextResponse } from "next/server";
import { isGuardFail, requireSellerAuth } from "@/lib/server/guards";
import { syncChargeFromPodPay } from "@/lib/acquirers/podpay/gateway";

/**
 * POST /api/v1/payments/:id/sync
 * Consulta status REAL na adquirente e atualiza a venda no DarkPay.
 * Use após pagar o PIX (especialmente em localhost sem webhook público).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSellerAuth(req, { permission: "transacoes" });
  if (isGuardFail(gate)) return gate.error;

  try {
    const { id } = await ctx.params;
    const charge = await syncChargeFromPodPay(id, gate.user.id);

    if (charge.sellerId !== gate.user.id && !gate.user.roles.includes("admin")) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Cobrança de outro seller" } },
        { status: 403 }
      );
    }

    return NextResponse.json({
      id: charge.id,
      status: charge.status,
      amount: charge.amount,
      paidAt: charge.paidAt,
      transactionId: charge.transactionId,
      sellerId: charge.sellerId,
      pix: {
        qrCode: charge.pixQrCode,
        copyPaste: charge.pixCopyPaste,
      },
      message:
        charge.status === "paid"
          ? "Pagamento confirmado na adquirente. Venda real aprovada."
          : charge.status === "waiting_payment"
            ? "Ainda aguardando pagamento PIX na adquirente."
            : `Status atualizado: ${charge.status}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao sincronizar";
    return NextResponse.json(
      { error: { code: "sync_failed", message: msg } },
      { status: 400 }
    );
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  return POST(req, ctx);
}
