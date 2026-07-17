import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  isPodPayEnabledFromRequest,
  resolvePodPayConfigFromRequest,
} from "@/lib/acquirers/podpay/config";

/** GET /api/v1/acquirers/podpay/status */
export async function GET(req: Request) {
  const __gate = await requireAdmin(req);
  if (isGuardFail(__gate)) return __gate.error;
  const config = resolvePodPayConfigFromRequest(req);
  return NextResponse.json({
    configured: isPodPayEnabledFromRequest(req),
    env: config?.env ?? null,
    baseUrl: config?.baseUrl ?? null,
    apiKeyPreview: config?.apiKey
      ? `${config.apiKey.slice(0, 10)}…${config.apiKey.slice(-4)}`
      : null,
    docs: "https://docs.podpay.app/",
    sections: [
      "credenciais",
      "saldo",
      "pagamentos",
      "saques",
      "checkout",
      "webhooks",
    ],
  });
}
