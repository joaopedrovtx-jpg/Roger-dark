import { NextResponse } from "next/server";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import {
  createApiCredential,
  listApiCredentials,
  type ApiPermission,
  type ApiKeyEnv,
} from "@/lib/server/db/api-credentials.service";

/**
 * GET  /api/v1/api-credentials lista (sem secret — só hint)
 * POST /api/v1/api-credentials cria (retorna secret UMA vez)
 */
export async function GET(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const items = await listApiCredentials(gate.user.id);
    return NextResponse.json({
      source: "database",
      items,
      total: items.length,
      format: {
        publicKey: "pk_live_… | pk_test_…",
        secretKey: "sk_live_… | sk_test_… (só no create/rotate/reveal)",
        authHeader: "Authorization: Bearer sk_live_…",
        endpoint: "/api/v1/payments",
        reveal: "POST /api/v1/api-credentials/:id { action: \"reveal\" }",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      permissions?: ApiPermission[];
      requireManualSaqueApproval?: boolean;
      expiresAt?: string | null;
      env?: ApiKeyEnv;
    };

    const created = await createApiCredential(gate.user.id, {
      name: body.name,
      permissions: body.permissions,
      requireManualSaqueApproval: body.requireManualSaqueApproval,
      expiresAt: body.expiresAt,
      env: body.env,
    });

    return NextResponse.json(
      {
        ...created,
        warning:
          "Chave criada. Use o olho para ver e o botão copiar quando precisar.",
      },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar credencial";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
