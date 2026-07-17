import { NextResponse } from "next/server";
import { podpayClient } from "@/lib/acquirers/podpay/client";
import {
  isPodPayEnabledFromRequest,
  resolvePodPayConfigFromRequest,
} from "@/lib/acquirers/podpay/config";
import type { PodPayCheckoutCreateSessionRequest } from "@/lib/acquirers/podpay/types";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";

/**
 * POST /api/v1/acquirers/podpay/checkout/sessions
 * Proxy → PodPay POST /v1/checkout/sessions
 */
export async function POST(req: Request) {
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
    const body = (await req.json()) as PodPayCheckoutCreateSessionRequest;
    if (!body.successUrl || !body.cancelUrl || !body.lineItems?.length) {
      return NextResponse.json(
        {
          error:
            "successUrl, cancelUrl e lineItems (productId do catálogo PodPay) são obrigatórios",
        },
        { status: 400 }
      );
    }

    if (!body.postbackUrl && config.postbackBaseUrl) {
      body.postbackUrl = `${config.postbackBaseUrl.replace(/\/$/, "")}/api/v1/webhooks/podpay`;
    }

    const session = await podpayClient.createCheckoutSession(body, { config });
    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
