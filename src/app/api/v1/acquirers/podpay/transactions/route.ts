import { NextResponse } from "next/server";
import { podpayClient } from "@/lib/acquirers/podpay/client";
import {
  isPodPayEnabledFromRequest,
  resolvePodPayConfigFromRequest,
} from "@/lib/acquirers/podpay/config";
import type { PodPayCreateTransaction } from "@/lib/acquirers/podpay/types";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";

/** GET /api/v1/acquirers/podpay/transactions lista vendas remotas */
export async function GET(req: Request) {
  const __gate = await requireAdmin(req);
  if (isGuardFail(__gate)) return __gate.error;
  try {
    if (!isPodPayEnabledFromRequest(req)) {
      return NextResponse.json(
        { error: "PodPay não configurada" },
        { status: 400 }
      );
    }
    const config = resolvePodPayConfigFromRequest(req)!;
    const { searchParams } = new URL(req.url);
    const data = await podpayClient.listTransactions({
      page: Number(searchParams.get("page") ?? 1) || 1,
      pageSize: Number(searchParams.get("pageSize") ?? 20) || 20,
      status: searchParams.get("status") ?? undefined,
      config,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/** POST /api/v1/acquirers/podpay/transactions cria direto na PodPay */
export async function POST(req: Request) {
  const __gate = await requireAdmin(req);
  if (isGuardFail(__gate)) return __gate.error;
  try {
    if (!isPodPayEnabledFromRequest(req)) {
      return NextResponse.json(
        { error: "PodPay não configurada" },
        { status: 400 }
      );
    }
    const config = resolvePodPayConfigFromRequest(req)!;
    const body = (await req.json()) as PodPayCreateTransaction;
    const data = await podpayClient.createTransaction(body, { config });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
