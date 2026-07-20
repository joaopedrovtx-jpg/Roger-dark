import { NextResponse } from "next/server";
import { isGuardFail, requireStaffPermission } from "@/lib/server/guards";
import {
  dbCreateManagerFromUser,
  listAdminManagers,
} from "@/lib/server/db/admin-managers.service";
import { adminGerentesMock } from "@/lib/mock/admin";

/** GET /api/v1/admin/managers */
export async function GET(req: Request) {
  const gate = await requireStaffPermission(req, "gerentes");
  if (isGuardFail(gate)) return gate.error;
  try {
    const db = await listAdminManagers();
    if (db) {
      return NextResponse.json({
        source: "mysql",
        items: db,
        total: db.length,
      });
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

/**
 * POST /api/v1/admin/managers
 * body: { userId: string, permissions?: string[] }
 */
export async function POST(req: Request) {
  const gate = await requireStaffPermission(req, "gerentes");
  if (isGuardFail(gate)) return gate.error;

  try {
    const body = (await req.json()) as {
      userId?: string;
      permissions?: string[];
    };
    if (!body.userId?.trim()) {
      return NextResponse.json(
        { error: "Informe o userId do seller a promover" },
        { status: 400 }
      );
    }

    const allowed = new Set([
      "dashboard",
      "usuarios",
      "documentos",
      "saques",
      "adquirentes",
      "gerentes",
    ]);
    const permissions = (body.permissions || []).filter((p) =>
      allowed.has(String(p))
    );

    const created = await dbCreateManagerFromUser({
      userId: body.userId.trim(),
      permissions:
        permissions.length > 0
          ? permissions
          : ["dashboard", "usuarios", "documentos", "saques"],
    });

    if (!created) {
      return NextResponse.json(
        { error: "Banco indisponível" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { source: "mysql", ...created },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
