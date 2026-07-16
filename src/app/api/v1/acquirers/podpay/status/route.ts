import { NextResponse } from "next/server";
import {
  isPodPayEnabledFromRequest,
  resolvePodPayConfigFromRequest,
} from "@/lib/acquirers/podpay/config";

/** GET /api/v1/acquirers/podpay/status */
export async function GET(req: Request) {
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
