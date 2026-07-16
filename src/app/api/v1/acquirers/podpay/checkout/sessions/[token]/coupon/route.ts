import { NextResponse } from "next/server";
import { podpayClient } from "@/lib/acquirers/podpay/client";
import {
  isPodPayEnabledFromRequest,
  resolvePodPayConfigFromRequest,
} from "@/lib/acquirers/podpay/config";

/** POST /api/v1/acquirers/podpay/checkout/sessions/:token/coupon */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    if (!isPodPayEnabledFromRequest(req)) {
      return NextResponse.json(
        { error: "PodPay não configurada" },
        { status: 400 }
      );
    }
    const config = resolvePodPayConfigFromRequest(req)!;
    const { token } = await ctx.params;
    const body = (await req.json()) as { code?: string };
    if (!body?.code?.trim()) {
      return NextResponse.json({ error: "code obrigatório" }, { status: 400 });
    }
    const data = await podpayClient.applyCheckoutCoupon(
      token,
      { code: body.code.trim() },
      config
    );
    return NextResponse.json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
