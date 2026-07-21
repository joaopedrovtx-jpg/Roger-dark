import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { listAdminUsers } from "@/lib/server/db/admin-users.service";

/** GET /api/v1/admin/sellers */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;
  try {
    const { searchParams } = new URL(req.url);
    const result = await listAdminUsers({
      page: Number(searchParams.get("page") ?? 1),
      pageSize: Number(searchParams.get("pageSize") ?? 50),
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });
    if (result) {
      return NextResponse.json({ source: "mysql", ...result });
    }
    // Sem DB: 503 em vez de devolver mock silenciosamente.
    return NextResponse.json(
      {
        error:
          "MySQL indisponível. Suba o banco e rode npm run db:seed para listar sellers.",
      },
      { status: 503 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
