import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { velanaClient, VelanaError } from "@/lib/acquirers/velana/client";
import { toCents } from "@/lib/acquirers/velana/mappers";
import {
  resolveVelanaConfigForBff,
  velanaNotConfigured,
} from "@/lib/acquirers/velana/server";

/**
 * POST /api/v1/acquirers/velana/transactions/:id/refund
 * Docs: POST /v1/transactions/{id}/refund  body opcional { amount } em centavos
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const { id } = await ctx.params;
    const config = await resolveVelanaConfigForBff(req);
    if (!config?.secretKey) {
      return NextResponse.json(velanaNotConfigured(), { status: 503 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      amount?: number;
      amountCents?: number;
    };
    let amountCents = body.amountCents;
    if (amountCents == null && body.amount != null) {
      // se veio em reais (< 1000 e tem decimal) ou já centavos
      amountCents =
        body.amount < 1000 && !Number.isInteger(body.amount)
          ? toCents(body.amount)
          : Math.round(body.amount);
    }
    const data = await velanaClient.refundTransaction(
      id,
      amountCents,
      config
    );
    return NextResponse.json({ success: true, provider: "velana", data });
  } catch (e) {
    const err = e as VelanaError;
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Erro",
        code: err.code,
        details: err.details,
      },
      { status: err.status && err.status < 600 ? err.status : 502 }
    );
  }
}
