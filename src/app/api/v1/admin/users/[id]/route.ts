import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  dbSetUserDocumentsStatus,
  dbUpdateUserFees,
  dbUpdateUserRouting,
  dbUpdateUserStatus,
} from "@/lib/server/db/admin.service";

/**
 * PATCH /api/v1/admin/users/:id
 * body:
 *  { status } | { fees } | { saqueAutomatico, routingMode, adquirenteIds } | { documentsStatus }
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
      status?: "ativo" | "pendente" | "bloqueado";
      fees?: {
        mdrPercent: number;
        mdrFixed: number;
        saquePercent: number;
        saqueFixed: number;
      };
      saqueAutomatico?: boolean;
      routingMode?: string;
      preferredAdquirenteId?: string | null;
      adquirenteIds?: string[];
      documentsStatus?: "aprovado" | "pendente" | "rejeitado";
    };

    if (body.status) {
      const r = await dbUpdateUserStatus(id, body.status);
      if (!r) {
        // sem DB — ok mock (UI já atualiza local)
        return NextResponse.json({ id, status: body.status, source: "mock" });
      }
      return NextResponse.json({ ...r, source: "mysql" });
    }

    if (body.fees) {
      const r = await dbUpdateUserFees(id, body.fees);
      if (!r) {
        return NextResponse.json({
          id,
          fees: body.fees,
          source: "mock",
        });
      }
      return NextResponse.json({ ...r, source: "mysql" });
    }

    if (body.documentsStatus) {
      const r = await dbSetUserDocumentsStatus(id, body.documentsStatus);
      if (!r) {
        return NextResponse.json({
          ok: true,
          source: "mock",
          documentsStatus: body.documentsStatus,
        });
      }
      return NextResponse.json({ ...r, source: "mysql" });
    }

    if (
      body.saqueAutomatico !== undefined ||
      body.routingMode ||
      body.adquirenteIds
    ) {
      const r = await dbUpdateUserRouting(id, body);
      if (!r) {
        return NextResponse.json({ id, source: "mock", ...body });
      }
      return NextResponse.json({ ...r, source: "mysql" });
    }

    return NextResponse.json(
      { error: "Nenhum campo válido para atualizar" },
      { status: 400 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
