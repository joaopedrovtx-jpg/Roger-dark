import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  resolvePodPayConfigFromRequest,
  resolvePodPayConfigServer,
} from "@/lib/acquirers/podpay/config";
import { podpayClient } from "@/lib/acquirers/podpay/client";

/** GET /api/v1/acquirers/podpay/status — probe real + DB/env keys */
export async function GET(req: Request) {
  const __gate = await requireAdmin(req);
  if (isGuardFail(__gate)) return __gate.error;

  const fromHeader = resolvePodPayConfigFromRequest(req);
  const fromDb = await resolvePodPayConfigServer();
  const config = fromHeader ?? fromDb;

  if (!config?.apiKey) {
    return NextResponse.json({
      ok: false,
      configured: false,
      env: null,
      baseUrl: null,
      apiKeyPreview: null,
      error: "PodPay sem secret key (Admin → Adquirentes ou PODPAY_API_KEY).",
      docs: "https://docs.podpay.app/",
    });
  }

  let probeOk = false;
  let probeError: string | null = null;
  try {
    await podpayClient.getAvailableBalance(config);
    probeOk = true;
  } catch (e) {
    probeError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(
    {
      ok: probeOk,
      configured: true,
      env: config.env ?? null,
      baseUrl: config.baseUrl ?? null,
      apiKeyPreview: `${config.apiKey.slice(0, 10)}…${config.apiKey.slice(-4)}`,
      source: fromHeader ? "header_or_env" : "db_or_env",
      error: probeError,
      docs: "https://docs.podpay.app/",
      sections: [
        "credenciais",
        "saldo",
        "pagamentos",
        "saques",
        "checkout",
        "webhooks",
      ],
    },
    { status: probeOk ? 200 : 502 }
  );
}
