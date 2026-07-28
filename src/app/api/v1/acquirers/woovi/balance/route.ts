import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { resolveWooviConfigServer } from "@/lib/acquirers/woovi/config";
import { syncBalanceFromWoovi } from "@/lib/acquirers/woovi/gateway";

/**
 * GET /api/v1/acquirers/woovi/balance
 */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const config = await resolveWooviConfigServer();
    if (!config?.appId) {
      return NextResponse.json(
        { error: "Woovi não configurada" },
        { status: 503 }
      );
    }
    const bal = await syncBalanceFromWoovi();
    if (!bal) {
      return NextResponse.json(
        { error: "Não foi possível obter saldo Woovi" },
        { status: 502 }
      );
    }
    return NextResponse.json({
      source: "woovi",
      ...bal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
