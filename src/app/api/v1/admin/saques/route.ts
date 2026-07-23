import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  getAdminSaquesMetrics,
  listAdminWithdrawals,
} from "@/lib/server/db/admin-withdrawals.service";
import { adminSaquesMock, saqueFeeAmount } from "@/lib/mock/admin";

export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const page = Number(searchParams.get("page") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? 50);

    const [metrics, result] = await Promise.all([
      getAdminSaquesMetrics(),
      listAdminWithdrawals(status, page, pageSize),
    ]);

    if (metrics && result) {
      return NextResponse.json({
        source: "mysql",
        metrics,
        items: result.items,
        total: result.total,
        page,
        pageSize,
      });
    }

    let list = [...adminSaquesMock];
    if (status && status !== "todos") {
      list = list.filter((s) => s.status === status);
    }
    const paid = adminSaquesMock.filter((s) => s.status === "pago");
    const pending = adminSaquesMock.filter((s) => s.status === "processando");
    const rejected = adminSaquesMock.filter((s) => s.status === "recusado");
    return NextResponse.json({
      source: "mock",
      metrics: {
        totalOut: paid.reduce((a, s) => a + s.amount, 0),
        pendingAmount: pending.reduce((a, s) => a + s.amount, 0),
        lucroSobreSaque: paid.reduce((a, s) => a + saqueFeeAmount(s), 0),
        paidCount: paid.length,
        pendingCount: pending.length,
        rejectedCount: rejected.length,
      },
      items: list,
      total: list.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
