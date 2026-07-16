import { NextResponse } from "next/server";
import { podpayClient } from "@/lib/acquirers/podpay/client";
import {
  isPodPayEnabledFromRequest,
  resolvePodPayConfigFromRequest,
} from "@/lib/acquirers/podpay/config";

/**
 * POST /api/v1/acquirers/podpay/checkout/payment-links/:publicToken/sessions
 * Abre sessão a partir de link de pagamento público.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ publicToken: string }> }
) {
  try {
    if (!isPodPayEnabledFromRequest(req)) {
      return NextResponse.json(
        { error: "PodPay não configurada" },
        { status: 400 }
      );
    }
    const config = resolvePodPayConfigFromRequest(req)!;
    const { publicToken } = await ctx.params;
    let body: { expiresAt?: string } = {};
    try {
      body = (await req.json()) as { expiresAt?: string };
    } catch {
      body = {};
    }
    const data = await podpayClient.openPaymentLinkSession(
      publicToken,
      body,
      config
    );
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
