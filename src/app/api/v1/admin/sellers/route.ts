import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { mockAdapter } from "@/lib/api/adapters/mock";

/** GET /api/v1/admin/sellers */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;
  try {
    const { searchParams } = new URL(req.url);
    const result = await mockAdapter.listSellers({
      page: Number(searchParams.get("page") ?? 1),
      pageSize: Number(searchParams.get("pageSize") ?? 50),
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
