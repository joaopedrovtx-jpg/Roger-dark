import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { listAdminManagers } from "@/lib/server/db/admin-managers.service";
import { adminGerentesMock } from "@/lib/mock/admin";

export async function GET() {
  const gate = await requireAdmin();
  if (isGuardFail(gate)) return gate.error;
  try {
    const db = await listAdminManagers();
    if (db) {
      return NextResponse.json({ source: "mysql", items: db, total: db.length });
    }
    return NextResponse.json({
      source: "mock",
      items: adminGerentesMock,
      total: adminGerentesMock.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
