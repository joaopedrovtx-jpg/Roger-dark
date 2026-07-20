import { NextResponse } from "next/server";
import {
  authenticateApiKeyDetailed,
  messageForApiKeyFailure,
} from "@/lib/server/db/api-credentials.service";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { securityHeaders } from "@/lib/server/security";

/**
 * GET /api/v1
 *
 * Entrada da API (mesmo padrão VizzionPay):
 *
 *   await axios.get('https://darkpays.online/api/v1', {
 *     headers: {
 *       'x-public-key': 'pk_live_…',
 *       'x-secret-key': 'sk_live_…',
 *     },
 *   });
 *
 * Valida o par de chaves no MySQL e devolve status da conta + endpoints Pix.
 */
export async function GET(req: Request) {
  const headers = securityHeaders();

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "DATABASE_URL não configurada",
        code: "db_unconfigured",
      },
      { status: 503, headers }
    );
  }

  const detailed = await authenticateApiKeyDetailed(req);
  if (!detailed.auth) {
    const failure = detailed.failure || "missing";
    return NextResponse.json(
      {
        ok: false,
        authenticated: false,
        error: messageForApiKeyFailure(failure),
        code: `api_key_${failure}`,
        hint:
          "Envie x-public-key (pk_…) e x-secret-key (sk_…) gerados em Integrações → API. " +
          "Ex.: axios.get(BASE, { headers: { 'x-public-key': pk, 'x-secret-key': sk } })",
        example: {
          url: "https://darkpays.online/api/v1",
          headers: {
            "x-public-key": "pk_live_xxxxxxxx",
            "x-secret-key": "sk_live_xxxxxxxx",
          },
        },
      },
      { status: 401, headers }
    );
  }

  const apiAuth = detailed.auth;

  try {
    const user = await prisma.user.findUnique({
      where: { id: apiAuth.userId },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        balanceAvailable: true,
        balancePending: true,
        balanceHeld: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: "Usuário da credencial não encontrado",
          code: "user_not_found",
        },
        { status: 401, headers }
      );
    }

    if (user.status === "bloqueado") {
      return NextResponse.json(
        {
          ok: false,
          error: "Conta bloqueada",
          code: "account_blocked",
        },
        { status: 403, headers }
      );
    }

    const origin = new URL(req.url).origin;

    return NextResponse.json(
      {
        ok: true,
        authenticated: true,
        message: "Credenciais válidas",
        service: "darkpay",
        baseUrl: `${origin}/api/v1`,
        account: {
          id: user.id,
          name: user.name,
          email: user.email,
          status: user.status,
          balances: {
            available: Number(user.balanceAvailable),
            pending: Number(user.balancePending),
            held: Number(user.balanceHeld),
          },
        },
        credential: {
          id: apiAuth.credentialId,
          publicKey: apiAuth.publicKey,
          env: apiAuth.env,
          permissions: apiAuth.permissions,
        },
        endpoints: {
          health: `${origin}/api/health`,
          apiRoot: `${origin}/api/v1`,
          createPix: `${origin}/api/v1/payments`,
          listPayments: `${origin}/api/v1/payments`,
          getPayment: `${origin}/api/v1/payments/{id}`,
          syncPayment: `${origin}/api/v1/payments/{id}/sync`,
          transactions: `${origin}/api/v1/transactions`,
          finance: `${origin}/api/v1/finance`,
          withdrawals: `${origin}/api/v1/withdrawals`,
        },
        pix: {
          create: {
            method: "POST",
            url: `${origin}/api/v1/payments`,
            headers: {
              "x-public-key": apiAuth.publicKey,
              "x-secret-key": "sk_live_…",
              "Content-Type": "application/json",
            },
            body: {
              amount: 97.0,
              description: "Pedido #1001",
              customerName: "Cliente",
              customerDocument: "52998224725",
            },
          },
        },
      },
      { status: 200, headers }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    return NextResponse.json(
      { ok: false, error: msg, code: "internal_error" },
      { status: 500, headers }
    );
  }
}
