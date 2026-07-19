import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  dbClearAcquirerCredentials,
  dbSaveAcquirerCredentials,
  dbSetAcquirerPrimary,
  dbSwapAcquirerPriority,
  dbUpdateAcquirerStatus,
  getAcquirerSecrets,
} from "@/lib/server/db/admin-acquirers.service";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  if (url.searchParams.get("reveal") !== "1") {
    return NextResponse.json(
      { error: "Use ?reveal=1 para obter chaves (admin)." },
      { status: 400 }
    );
  }
  const secrets = await getAcquirerSecrets(id);
  if (!secrets) {
    return NextResponse.json({ error: "Adquirente não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ source: "database", ...secrets });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  const { id } = await ctx.params;

  try {
    const body = (await req.json()) as {
      status?: "ativo" | "manutencao" | "inativo";
      priorityDir?: -1 | 1;
      publicKey?: string;
      privateKey?: string;
      env?: string;
      clearCredentials?: boolean;
      setPrimary?: boolean;
      makePrimary?: boolean;
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

    if (body.makePrimary === true || body.setPrimary === true) {
      if (
        body.publicKey === undefined &&
        body.privateKey === undefined &&
        body.makePrimary === true
      ) {
        const r = await dbSetAcquirerPrimary(id);
        return NextResponse.json({
          ok: true,
          source: r ? "database" : "mock",
          isPrimary: true,
          priority: 1,
        });
      }
    }

    if (body.priorityDir === 1 || body.priorityDir === -1) {
      const r = await dbSwapAcquirerPriority(id, body.priorityDir);
      return NextResponse.json({
        ok: r?.ok ?? true,
        source: r ? "mysql" : "mock",
      });
    }

    if (
      body.publicKey !== undefined ||
      body.privateKey !== undefined ||
      body.setPrimary !== undefined
    ) {
      const r = await dbSaveAcquirerCredentials(id, {
        publicKey: body.publicKey,
        privateKey: body.privateKey,
        env: body.env,
        setPrimary: body.setPrimary,
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
        hasPublicKey: r.hasPublicKey,
        env: r.env,
        isPrimary: r.isPrimary,
      });
    }

    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    console.error("[admin/acquirers PATCH]", id, msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
