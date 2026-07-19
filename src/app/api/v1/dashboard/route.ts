import { NextResponse } from "next/server";
import { mockAdapter } from "@/lib/api/adapters/mock";
import type { PeriodKey } from "@/lib/domain/types";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import { getSellerDashboard } from "@/lib/server/db/seller-dashboard.service";

export async function GET(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const { searchParams } = new URL(req.url);
    const period = (searchParams.get("period") ?? "7d") as PeriodKey;
    const sellerId = gate.user.id;

    const fromDb = await getSellerDashboard(sellerId, period);
    if (fromDb) {
      return NextResponse.json({ source: "mysql", ...fromDb });
    }

    if (process.env.ALLOW_MOCK_DATA !== "1") {
      return NextResponse.json(
        {
          error:
            "MySQL indisponível. Suba o banco e rode npm run db:seed. (Dev: ALLOW_MOCK_DATA=1)",
        },
        { status: 503 }
      );
    }

    const data = await mockAdapter.getDashboard(period);
    return NextResponse.json({ source: "mock", ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
