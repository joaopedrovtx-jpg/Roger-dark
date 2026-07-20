import { NextResponse } from "next/server";
import { getFinanceSnapshot } from "@/lib/services/withdrawal.service";
import {
  isGuardFail,
  requireAuth,
  resolveSellerScope,
} from "@/lib/server/guards";
import { getSellerFinance } from "@/lib/server/db/seller-finance.service";

export async function GET(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  const scope = await resolveSellerScope(req, gate);
  if (isGuardFail(scope)) return scope.error;

  try {
    const sellerId = scope.sellerId;
    const fromDb = await getSellerFinance(sellerId);
    if (fromDb) {
      return NextResponse.json({
        source: "mysql",
        viewOnly: scope.viewOnly,
        ...fromDb,
      });
    }
    if (process.env.ALLOW_MOCK_DATA !== "1") {
      return NextResponse.json(
        { error: "MySQL indisponível. Suba o banco e rode npm run db:seed." },
        { status: 503 }
      );
    }
    const snap = getFinanceSnapshot(sellerId);
    return NextResponse.json({
      source: "mock",
      viewOnly: scope.viewOnly,
      ...snap,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
