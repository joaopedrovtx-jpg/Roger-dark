import { NextResponse } from "next/server";
import { podpayClient } from "@/lib/acquirers/podpay/client";
import { mapPodPayBalance } from "@/lib/acquirers/podpay/mappers";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  resolvePodPayConfigFromRequest,
  resolvePodPayConfigServer,
} from "@/lib/acquirers/podpay/config";

/** GET /api/v1/acquirers/podpay/balance saldo remoto PodPay (DB ou env) */
export async function GET(req: Request) {
  const __gate = await requireAdmin(req);
  if (isGuardFail(__gate)) return __gate.error;
  try {
    const config =
      resolvePodPayConfigFromRequest(req) ??
      (await resolvePodPayConfigServer());
    if (!config?.apiKey) {
      return NextResponse.json(
        {
          error:
            "PodPay não configurada. Salve a secret em Admin → Adquirentes → PodPay ou PODPAY_API_KEY.",
        },
        { status: 400 }
      );
    }
    const remote = await podpayClient.getAvailableBalance(config);
    return NextResponse.json({
      success: true,
      data: {
        raw: remote,
        mapped: mapPodPayBalance(remote),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro PodPay";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
