import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { velanaClient, VelanaError } from "@/lib/acquirers/velana/client";
import {
  resolveVelanaConfigForBff,
  velanaNotConfigured,
} from "@/lib/acquirers/velana/server";

/** GET /api/v1/acquirers/velana/company GET /v1/company */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const config = await resolveVelanaConfigForBff(req);
    if (!config?.secretKey) {
      return NextResponse.json(velanaNotConfigured(), { status: 503 });
    }
    const data = await velanaClient.getCompany(config);
    return NextResponse.json({ success: true, provider: "velana", data });
  } catch (e) {
    const err = e as VelanaError;
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Erro",
        code: err.code,
        details: err.details,
      },
      { status: err.status && err.status < 600 ? err.status : 502 }
    );
  }
}
