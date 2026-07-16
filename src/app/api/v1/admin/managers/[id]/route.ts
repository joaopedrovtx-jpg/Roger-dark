import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { dbUpdateManagerStatus } from "@/lib/server/db/admin.service";

/** PATCH /api/v1/admin/managers/:id { status: ativo | inativo } */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { status?: "ativo" | "inativo" };
    if (body.status !== "ativo" && body.status !== "inativo") {
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    }
    const r = await dbUpdateManagerStatus(id, body.status);
    return NextResponse.json({
      id,
      status: body.status,
      source: r ? "mysql" : "mock",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
