import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  dbClearAcquirerCredentials,
  dbSaveAcquirerCredentials,
  dbSwapAcquirerPriority,
  dbUpdateAcquirerStatus,
} from "@/lib/server/db/admin.service";

/**
 * PATCH /api/v1/admin/acquirers/:id
 * { status } | { priorityDir: -1|1 } | { publicKey, privateKey, env } | { clearCredentials: true }
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      status?: "ativo" | "manutencao" | "inativo";
      priorityDir?: -1 | 1;
      publicKey?: string;
      privateKey?: string;
      env?: string;
      clearCredentials?: boolean;
    };

    if (body.clearCredentials) {
      const r = await dbClearAcquirerCredentials(id);
      return NextResponse.json({
        ok: true,
        source: r ? "mysql" : "mock",
      });
    }

    if (body.status) {
      const r = await dbUpdateAcquirerStatus(id, body.status);
      return NextResponse.json({
        id,
        status: body.status,
        source: r ? "mysql" : "mock",
      });
    }

    if (body.priorityDir === 1 || body.priorityDir === -1) {
      const r = await dbSwapAcquirerPriority(id, body.priorityDir);
      return NextResponse.json({
        ok: r?.ok ?? true,
        source: r ? "mysql" : "mock",
      });
    }

    if (body.publicKey !== undefined || body.privateKey !== undefined) {
      const r = await dbSaveAcquirerCredentials(id, {
        publicKey: body.publicKey ?? "",
        privateKey: body.privateKey ?? "",
        env: body.env,
      });
      if (!r) {
        return NextResponse.json(
          {
            error:
              "Banco de dados indisponível. Confira DATABASE_URL e rode npm run setup.",
            saved: false,
          },
          { status: 503 }
        );
      }
      return NextResponse.json({
        id: r.id,
        source: "database",
        saved: true,
        hasPrivateKey: r.hasPrivateKey,
      });
    }

    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
