import { NextResponse } from "next/server";
import { isGuardFail, requireSellerAuth } from "@/lib/server/guards";
import { syncChargeFromPodPay } from "@/lib/acquirers/podpay/gateway";
import { syncChargeFromVelana } from "@/lib/acquirers/velana/gateway";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

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

    let provider: string | null = null;
    let chargeRow: { id: string; sellerId: string; provider: string | null } | null = null;
    if (isDatabaseConfigured()) {
      chargeRow = await prisma.paymentCharge.findFirst({
        where: {
          OR: [{ id }, { providerId: id }, { transactionId: id }],
        },
        select: { id: true, sellerId: true, provider: true },
      });
    }

    const ownerId = chargeRow?.sellerId;
    if (ownerId && ownerId !== gate.user.id && !gate.user.roles.includes("admin")) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Cobrança de outro seller" } },
        { status: 403 }
      );
    }

    if (!chargeRow || !ownerId) {
      return NextResponse.json(
        {
          error: {
            code: "not_found",
            message: "Cobrança não encontrada para este seller",
          },
        },
        { status: 404 }
      );
    }

    provider = chargeRow.provider ?? null;

    const charge =
      provider === "velana" || id.startsWith("vl_") || id.startsWith("TX-VL-")
        ? await syncChargeFromVelana(id, gate.user.id)
        : provider === "podpay" || id.startsWith("pp_") || id.startsWith("TX-PP-")
          ? await syncChargeFromPodPay(id, gate.user.id)
          : await syncChargeAuto(id, gate.user.id);

    return NextResponse.json({
      id: charge.id,
      status: charge.status,
      amount: charge.amount,
      paidAt: charge.paidAt,
      transactionId: charge.transactionId,
      sellerId: charge.sellerId,
      provider: provider || undefined,
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

/** Tenta Velana e depois PodPay quando o provider local é desconhecido */
async function syncChargeAuto(id: string, sellerId: string) {
  try {
    return await syncChargeFromVelana(id, sellerId);
  } catch {
    return syncChargeFromPodPay(id, sellerId);
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  return POST(req, ctx);
}
