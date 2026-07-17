import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { velanaClient, VelanaError } from "@/lib/acquirers/velana/client";
import { mapVelanaBalance } from "@/lib/acquirers/velana/mappers";
import {
  resolveVelanaConfigForBff,
  velanaNotConfigured,
} from "@/lib/acquirers/velana/server";

/** GET /api/v1/acquirers/velana/balance — GET /v1/balance/available */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const config = await resolveVelanaConfigForBff(req);
    if (!config?.secretKey) {
      return NextResponse.json(velanaNotConfigured(), { status: 503 });
    }
    const remote = await velanaClient.getAvailableBalance(config);
    return NextResponse.json({
      success: true,
      provider: "velana",
      data: {
        raw: remote,
        mapped: mapVelanaBalance(remote),
      },
    });
  } catch (e) {
    const err = e as VelanaError;
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Erro Velana",
        code: err.code,
        details: err.details,
      },
      { status: err.status && err.status < 600 ? err.status : 502 }
    );
  }
}
