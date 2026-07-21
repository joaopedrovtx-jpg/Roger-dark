import { NextResponse } from "next/server";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import {
  deleteApiCredential,
  revealApiCredentialSecret,
  rotateApiCredential,
  updateApiCredential,
  type ApiPermission,
} from "@/lib/server/db/api-credentials.service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH  /api/v1/api-credentials/:id editar nome/perms
 * DELETE /api/v1/api-credentials/:id excluir
 * POST   /api/v1/api-credentials/:id { action: "rotate" | "reveal" }
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      name?: string;
      permissions?: ApiPermission[];
      requireManualSaqueApproval?: boolean;
      expiresAt?: string | null;
      active?: boolean;
      action?: "rotate" | "reveal";
    };

    if (body.action === "rotate") {
      const rotated = await rotateApiCredential(gate.user.id, id);
      return NextResponse.json({
        ...rotated,
        warning:
          "Novas chaves geradas. Copie a secret agora — não será listada de novo.",
      });
    }

    if (body.action === "reveal") {
      const revealed = await revealApiCredentialSecret(gate.user.id, id);
      return NextResponse.json({
        ...revealed,
        warning: "Secret revelada. Não compartilhe nem logue este valor.",
      });
    }

    const updated = await updateApiCredential(gate.user.id, id, body);
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    const status = msg.includes("não encontrada") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  return PATCH(req, ctx);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const { id } = await ctx.params;
    await deleteApiCredential(gate.user.id, id);
    return NextResponse.json({ ok: true, deleted: id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    const status = msg.includes("não encontrada") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
