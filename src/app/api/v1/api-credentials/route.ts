import { NextResponse } from "next/server";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import {
  createApiCredential,
  listApiCredentials,
  type ApiPermission,
  type ApiKeyEnv,
} from "@/lib/server/db/api-credentials.service";

/**
 * GET  /api/v1/api-credentials — lista credenciais do seller (sem secret)
 * POST /api/v1/api-credentials — cria (retorna secret uma vez)
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
        secretKey: "sk_live_… | sk_test_…",
        authHeader: "Authorization: Bearer sk_live_…",
        endpoint: "/api/v1/payments",
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
          "Copie a chave privada agora. Ela não será exibida novamente por segurança.",
      },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar credencial";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
