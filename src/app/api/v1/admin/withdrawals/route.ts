import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  getAdminSaquesMetrics,
  listAdminWithdrawals,
} from "@/lib/server/db/admin.service";

/**
 * GET /api/v1/admin/withdrawals — fila real de saques (banco)
 * Mesma fonte de Admin → Saques (seller solicita em Financeiro).
 */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;

    const [metrics, items] = await Promise.all([
      getAdminSaquesMetrics(),
      listAdminWithdrawals(status),
    ]);

    if (items) {
      return NextResponse.json({
        source: "database",
        metrics: metrics ?? undefined,
        items: items.map((s) => ({
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
        total: items.length,
      });
    }

    return NextResponse.json(
      {
        error: "Banco indisponível",
        items: [],
        total: 0,
      },
      { status: 503 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
