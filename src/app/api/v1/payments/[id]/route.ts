import { NextResponse } from "next/server";
import { getChargeAsync } from "@/lib/services/payment-read.service";
import { isGuardFail, requireSellerAuth } from "@/lib/server/guards";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSellerAuth(req, { permission: "transacoes" });
  if (isGuardFail(gate)) return gate.error;

  try {
    const { id } = await ctx.params;
    const charge = await getChargeAsync(id, gate.user.id);
    if (!charge || charge.sellerId !== gate.user.id) {
      return NextResponse.json(
        { error: { code: "not_found", message: "Cobrança não encontrada" } },
        { status: 404 }
      );
    }
    return NextResponse.json({
      id: charge.id,
      status: charge.status,
      amount: charge.amount,
      currency: charge.currency,
      method: charge.method,
      description: charge.description,
      customerName: charge.customerName,
      pix: {
        qrCode: charge.pixQrCode,
        copyPaste: charge.pixCopyPaste,
      },
      expiresAt: charge.expiresAt,
      createdAt: charge.createdAt,
      paidAt: charge.paidAt,
      transactionId: charge.transactionId,
      sellerId: charge.sellerId,
      real: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
