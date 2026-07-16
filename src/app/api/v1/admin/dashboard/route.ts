import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  getAdminDashboardMetrics,
  getAdminLedger,
  getAdminVolumeHistory,
} from "@/lib/server/db/admin.service";
import { mockAdapter } from "@/lib/api/adapters/mock";
import {
  adminLedgerMock,
  adminVolumeHistoryMock,
} from "@/lib/mock/admin";

/**
 * GET /api/v1/admin/dashboard
 * Payload completo da Dashboard Admin:
 * metrics + volumeHistory + ledger
 * (MySQL se DATABASE_URL; senão mock)
 */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;
  try {
    const [metricsDb, volumeDb, ledgerDb] = await Promise.all([
      getAdminDashboardMetrics(),
      getAdminVolumeHistory(10),
      getAdminLedger(80),
    ]);

    if (metricsDb && volumeDb && ledgerDb) {
      return NextResponse.json({
        source: "mysql",
        metrics: metricsDb,
        volumeHistory: volumeDb,
        ledger: ledgerDb,
      });
    }

    // Fallback mock (front/dev sem DB)
    const metrics = await mockAdapter.getAdminMetrics();
    return NextResponse.json({
      source: "mock",
      metrics,
      volumeHistory: adminVolumeHistoryMock,
      ledger: adminLedgerMock.slice(0, 80),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
