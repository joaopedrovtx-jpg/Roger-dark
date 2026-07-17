import { NextResponse } from "next/server";
import { podpayClient } from "@/lib/acquirers/podpay/client";
import { mapPodPayBalance } from "@/lib/acquirers/podpay/mappers";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  isPodPayEnabledFromRequest,
  resolvePodPayConfigFromRequest,
} from "@/lib/acquirers/podpay/config";

/** GET /api/v1/acquirers/podpay/balance — saldo remoto PodPay */
export async function GET(req: Request) {
  const __gate = await requireAdmin(req);
  if (isGuardFail(__gate)) return __gate.error;
  try {
    if (!isPodPayEnabledFromRequest(req)) {
      return NextResponse.json(
        {
          error:
            "PodPay não configurada. Defina PODPAY_API_KEY ou salve a chave em Integrações → PodPay.",
        },
        { status: 400 }
      );
    }
    const config = resolvePodPayConfigFromRequest(req)!;
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
