import { NextResponse } from "next/server";
import { isGuardFail, requireStaffPermission } from "@/lib/server/guards";
import { setWithdrawalStatusAsync } from "@/lib/services/withdrawal.service";
import type { SaqueStatus } from "@/lib/domain/types";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireStaffPermission(req, "saques");
  if (isGuardFail(gate)) return gate.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      status?: SaqueStatus;
      /** true = só marca no DarkPay (já pagou fora / PIX manual) */
      manual?: boolean;
    };
    if (body.status !== "pago" && body.status !== "recusado") {
      return NextResponse.json(
        { error: "status deve ser pago ou recusado" },
        { status: 400 }
      );
    }
    const w = await setWithdrawalStatusAsync(id, body.status, {
      manual: body.manual === true,
    });
    return NextResponse.json({ ...w, source: "ok" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
