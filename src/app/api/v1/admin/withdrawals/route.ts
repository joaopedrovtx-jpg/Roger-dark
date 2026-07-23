import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  getAdminSaquesMetrics,
  listAdminWithdrawals,
} from "@/lib/server/db/admin-withdrawals.service";

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

    if (result) {
      return NextResponse.json({
        source: "database",
        metrics: metrics ?? undefined,
        items: result.items.map((s) => ({
          id: s.id,
          sellerId: s.userId,
          sellerName: s.userName,
          date: s.date,
          amount: s.amount,
          method: s.method,
          destination: s.destination,
          status: s.status,
          feePercent: s.feePercent,
          feeFixed: s.feeFixed,
          feeAmount:
            typeof s.feeAmount === "number"
              ? s.feeAmount
              : Math.round(
                  ((s.amount * s.feePercent) / 100 + s.feeFixed) * 100
                ) / 100,
        })),
        total: result.total,
        page,
        pageSize,
      });
    }

    return NextResponse.json(
      { error: "Banco indisponível", items: [], total: 0 },
      { status: 503 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
