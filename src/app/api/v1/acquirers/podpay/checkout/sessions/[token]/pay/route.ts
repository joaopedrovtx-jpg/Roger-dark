import { NextResponse } from "next/server";
import { podpayClient } from "@/lib/acquirers/podpay/client";
import {
  isPodPayEnabledFromRequest,
  resolvePodPayConfigFromRequest,
} from "@/lib/acquirers/podpay/config";
import type { PodPayCheckoutPayRequest } from "@/lib/acquirers/podpay/types";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";

/** POST /api/v1/acquirers/podpay/checkout/sessions/:token/pay */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const __gate = await requireAdmin(req);
  if (isGuardFail(__gate)) return __gate.error;
  try {
    if (!isPodPayEnabledFromRequest(req)) {
      return NextResponse.json(
        { error: "PodPay não configurada" },
        { status: 400 }
      );
    }
    const config = resolvePodPayConfigFromRequest(req)!;
    const { token } = await ctx.params;
    const body = (await req.json()) as PodPayCheckoutPayRequest;
    if (!body?.customer) {
      return NextResponse.json(
        { error: "customer obrigatório" },
        { status: 400 }
      );
    }
    const data = await podpayClient.payCheckoutSession(token, body, { config });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
