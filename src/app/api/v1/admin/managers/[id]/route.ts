import { NextResponse } from "next/server";
import { isGuardFail, requireStaffPermission } from "@/lib/server/guards";
import { dbUpdateManagerStatus } from "@/lib/server/db/admin-managers.service";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireStaffPermission(req, "gerentes");
  if (isGuardFail(gate)) return gate.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      status?: "ativo" | "inativo";
      permissions?: string[];
    };

    if (body.status === "ativo" || body.status === "inativo") {
      const r = await dbUpdateManagerStatus(id, body.status);
      return NextResponse.json({
        id,
        status: body.status,
        source: r ? "mysql" : "mock",
      });
    }

    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
