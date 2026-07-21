import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { mockAdapter } from "@/lib/api/adapters/mock";
import { getAdminDashboardMetrics } from "@/lib/server/db/admin-metrics.service";

export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;
  try {
    const fromDb = await getAdminDashboardMetrics();
    if (fromDb) {
      return NextResponse.json({ source: "mysql", ...fromDb });
    }
    const metrics = await mockAdapter.getAdminMetrics();
    return NextResponse.json({ source: "mock", ...metrics });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
