import { NextResponse } from "next/server";
import {
  createWithdrawal,
  listWithdrawals,
} from "@/lib/services/withdrawal.service";
import {
  isGuardFail,
  requireAuth,
  resolveSellerScope,
  viewOnlyForbidden,
} from "@/lib/server/guards";
import { getSellerFinance } from "@/lib/server/db/seller-finance.service";
import { securityHeaders } from "@/lib/server/security";

export async function GET(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  const scope = await resolveSellerScope(req, gate);
  if (isGuardFail(scope)) return scope.error;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const sellerId = scope.sellerId;

    const fin = await getSellerFinance(sellerId);
    if (fin) {
      let items = fin.withdrawals;
      if (status) items = items.filter((w) => w.status === status);
      return NextResponse.json(
        { source: "mysql", items, total: items.length },
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

export async function POST(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  const scope = await resolveSellerScope(req, gate);
  if (isGuardFail(scope)) return scope.error;
  // Prova social: staff não saca na conta do seller
  if (scope.viewOnly) {
    return viewOnlyForbidden().error;
  }

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
