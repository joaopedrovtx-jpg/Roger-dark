import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  getAdminDashboardMetrics,
  getAdminLedger,
  getAdminVolumeHistory,
} from "@/lib/server/db/admin-metrics.service";
import { mockAdapter } from "@/lib/api/adapters/mock";

/**
 * GET /api/v1/admin/dashboard
 * Payload: metrics + volumeHistory + ledger
 */
function daysForPeriod(period: string | null): number {
  switch (period) {
    case "today":
    case "yesterday":
      return 1;
    case "15d":
      return 15;
    case "30d":
      return 30;
    case "60d":
      return 60;
    case "7d":
    default:
      return 7;
  }
}

export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period");
    const days = daysForPeriod(period);

    const [metricsDb, volumeDb, ledgerDb] = await Promise.all([
      getAdminDashboardMetrics(),
      getAdminVolumeHistory(days),
      getAdminLedger(80),
    ]);

    if (metricsDb) {
      return NextResponse.json({
        source: "mysql",
        metrics: metricsDb,
        volumeHistory: volumeDb ?? [],
        ledger: ledgerDb ?? [],
      });
    }

    // Sem DB: sem inventar volume no gráfico
    const metrics = await mockAdapter.getAdminMetrics();
    const emptyDays: Array<{ date: string; amount: number; grain: "day" }> =
      [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      emptyDays.push({
        date: d.toISOString().slice(0, 10),
        amount: 0,
        grain: "day",
      });
    }
    return NextResponse.json({
      source: "mock",
      metrics,
      volumeHistory: emptyDays,
      ledger: [],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
