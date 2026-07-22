/**
 * GET    /api/v1/integrations/utmify  — status da conexão
 * PUT    /api/v1/integrations/utmify  — salvar token
 * DELETE /api/v1/integrations/utmify  — desconectar
 * POST   /api/v1/integrations/utmify  — { action: "test" } validar token
 */
import { NextResponse } from "next/server";
import { isGuardFail, requireSellerAuth } from "@/lib/server/guards";
import {
  disconnectUtmify,
  getUtmifyConnection,
  saveUtmifyToken,
  testUtmifyConnection,
} from "@/lib/integrations/utmify/service";

export async function GET(req: Request) {
  const gate = await requireSellerAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const conn = await getUtmifyConnection(gate.user.id);
    return NextResponse.json({
      source: "database",
      platform: "DarkPay",
      docs: "https://docs.utmify.com.br/envio-de-vendas",
      howTo:
        "UTMify → Integrações → Webhooks → Credenciais de API → Adicionar Credencial",
      connection: conn,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const gate = await requireSellerAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const body = (await req.json()) as { apiToken?: string; token?: string };
    const token = (body.apiToken || body.token || "").trim();
    if (token.length < 8) {
      return NextResponse.json(
        { error: "Informe o Token de API gerado na UTMify." },
        { status: 400 }
      );
    }

    // Valida com isTest antes de persistir
    const test = await testUtmifyConnection(gate.user.id, token);
    if (!test.ok) {
      // Ainda permite salvar se a API retornou 4xx de "já existe" etc.,
      // mas bloqueia token claramente inválido (401/403/API_CREDENTIAL_NOT_FOUND)
      const hardFail =
        test.status === 401 ||
        test.status === 403 ||
        /API_CREDENTIAL_NOT_FOUND|unauthorized|invalid/i.test(test.error);
      if (hardFail) {
        return NextResponse.json(
          {
            error:
              "Token rejeitado pela UTMify. Gere um novo em Integrações → Webhooks → Credenciais de API.",
            detail: test.error,
          },
          { status: 400 }
        );
      }
      // Rede/timeout: salva mesmo assim e avisa
    }

    const conn = await saveUtmifyToken(gate.user.id, token);
    return NextResponse.json({
      ok: true,
      connection: conn,
      test: test.ok
        ? { ok: true }
        : { ok: false, warning: test.error, status: test.status },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao salvar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const gate = await requireSellerAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const conn = await disconnectUtmify(gate.user.id);
    return NextResponse.json({ ok: true, connection: conn });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requireSellerAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      apiToken?: string;
    };
    if (body.action !== "test") {
      return NextResponse.json(
        { error: "Use action: \"test\" para validar o token." },
        { status: 400 }
      );
    }
    const result = await testUtmifyConnection(
      gate.user.id,
      body.apiToken
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, status: result.status },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, message: "Token validado na UTMify (teste)." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
