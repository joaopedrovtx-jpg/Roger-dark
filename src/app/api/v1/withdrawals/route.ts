import { NextResponse } from "next/server";
import {
  createWithdrawal,
  listWithdrawals,
} from "@/lib/services/finance.service";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import { getSellerFinance } from "@/lib/server/db/seller.service";
import { securityHeaders } from "@/lib/server/security";

/** GET /api/v1/withdrawals — lista saques do seller logado */
export async function GET(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const sellerId = gate.user.id;

    const fin = await getSellerFinance(sellerId);
    if (fin) {
      let items = fin.withdrawals;
      if (status) items = items.filter((w) => w.status === status);
      return NextResponse.json(
        {
          source: "mysql",
          items,
          total: items.length,
        },
        { headers: securityHeaders() }
      );
    }

    if (process.env.ALLOW_MOCK_DATA !== "1") {
      return NextResponse.json(
        { error: "MySQL indisponível. Suba o banco e rode npm run db:seed." },
        { status: 503, headers: securityHeaders() }
      );
    }
    const items = listWithdrawals({
      sellerId,
      status: status ?? undefined,
    });
    return NextResponse.json(
      { source: "mock", items, total: items.length },
      { headers: securityHeaders() }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: securityHeaders() }
    );
  }
}

/**
 * POST /api/v1/withdrawals — solicita saque
 * Fluxo unificado: débito atômico DB → adquirente (Velana/PodPay) → row MySQL.
 */
export async function POST(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const body = (await req.json()) as {
      amount?: number;
      pixKey?: string;
    };
    if (!body.amount || !body.pixKey) {
      return NextResponse.json(
        { error: "amount e pixKey são obrigatórios" },
        { status: 400, headers: securityHeaders() }
      );
    }

    const w = await createWithdrawal(gate.user.id, gate.user.name, {
      amount: body.amount,
      pixKey: body.pixKey,
    });

    return NextResponse.json(
      { source: "unified", ...w },
      { status: 201, headers: securityHeaders() }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: securityHeaders() }
    );
  }
}
