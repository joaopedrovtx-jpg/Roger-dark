import { NextResponse } from "next/server";
import {
  createWithdrawal,
  listWithdrawals,
} from "@/lib/services/finance.service";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import {
  createSellerWithdrawalDb,
  getSellerFinance,
} from "@/lib/server/db/seller.service";

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
      return NextResponse.json({
        source: "mysql",
        items,
        total: items.length,
      });
    }

    if (process.env.ALLOW_MOCK_DATA !== "1") {
      return NextResponse.json(
        { error: "MySQL indisponível. Suba o banco e rode npm run db:seed." },
        { status: 503 }
      );
    }
    const items = listWithdrawals({
      sellerId,
      status: status ?? undefined,
    });
    return NextResponse.json({ source: "mock", items, total: items.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/v1/withdrawals — solicita saque */
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
        { status: 400 }
      );
    }

    const sellerId = gate.user.id;
    const name = gate.user.name;

    const fromDb = await createSellerWithdrawalDb(
      sellerId,
      name,
      body.amount,
      body.pixKey
    );
    if (fromDb) {
      return NextResponse.json({ source: "mysql", ...fromDb }, { status: 201 });
    }

    if (process.env.ALLOW_MOCK_DATA !== "1") {
      return NextResponse.json(
        { error: "MySQL indisponível. Impossível solicitar saque real." },
        { status: 503 }
      );
    }

    const w = await createWithdrawal(sellerId, name, {
      amount: body.amount,
      pixKey: body.pixKey,
    });
    return NextResponse.json({ source: "mock", ...w }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
