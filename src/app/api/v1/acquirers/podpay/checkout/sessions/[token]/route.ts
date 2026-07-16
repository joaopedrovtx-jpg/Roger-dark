import { NextResponse } from "next/server";
import { podpayClient } from "@/lib/acquirers/podpay/client";
import {
  isPodPayEnabledFromRequest,
  resolvePodPayConfigFromRequest,
} from "@/lib/acquirers/podpay/config";

/** GET /api/v1/acquirers/podpay/checkout/sessions/:token */
export async function GET(
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
    const data = await podpayClient.getCheckoutPublicSession(token, config);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
