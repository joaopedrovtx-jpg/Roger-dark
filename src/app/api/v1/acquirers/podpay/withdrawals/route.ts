import { NextResponse } from "next/server";
import { podpayClient } from "@/lib/acquirers/podpay/client";
import {
  isPodPayEnabledFromRequest,
  resolvePodPayConfigFromRequest,
} from "@/lib/acquirers/podpay/config";
import type { PodPayCreateWithdrawal } from "@/lib/acquirers/podpay/types";

/** GET /api/v1/acquirers/podpay/withdrawals */
export async function GET(req: Request) {
  try {
    if (!isPodPayEnabledFromRequest(req)) {
      return NextResponse.json(
        { error: "PodPay não configurada" },
        { status: 400 }
      );
    }
    const config = resolvePodPayConfigFromRequest(req)!;
    const { searchParams } = new URL(req.url);
    const data = await podpayClient.listWithdrawals({
      page: Number(searchParams.get("page") ?? 1) || 1,
      status: searchParams.get("status") ?? undefined,
      config,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/** POST /api/v1/acquirers/podpay/withdrawals */
export async function POST(req: Request) {
  try {
    if (!isPodPayEnabledFromRequest(req)) {
      return NextResponse.json(
        { error: "PodPay não configurada" },
        { status: 400 }
      );
    }
    const config = resolvePodPayConfigFromRequest(req)!;
    const body = (await req.json()) as PodPayCreateWithdrawal;
    const data = await podpayClient.createWithdrawal(body, { config });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
