import { NextResponse } from "next/server";
import { listChargesAsync } from "@/lib/services/payment.service";
import { isGuardFail, requireSellerAuth } from "@/lib/server/guards";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

/**
 * API pública de pagamento PIX do seller (gateway DarkPay).
 *
 * Auth:
 *  - Sessão do painel (playground), ou
 *  - Authorization: Bearer sk_live_… | sk_test_… (Integrações → API)
 *
 * A adquirente (PodPay) fica só no servidor DarkPay — o integrador não precisa da chave PodPay.
 *
 * POST /api/v1/payments — cria cobrança PIX
 * GET  /api/v1/payments — lista cobranças do seller
 */
export async function POST(req: Request) {
  const gate = await requireSellerAuth(req, { permission: "transacoes" });
  if (isGuardFail(gate)) return gate.error;

  try {
    const body = (await req.json()) as {
      amount?: number;
      description?: string;
      customerName?: string;
      customerDocument?: string;
      customerEmail?: string;
      customerPhone?: string;
      metadata?: Record<string, string>;
    };

    if (!body.amount || body.amount < 1) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_amount",
            message: "amount obrigatório (mín. R$ 1,00)",
          },
        },
        { status: 400 }
      );
    }

    const sellerId = gate.user.id;

    let customerDocument = body.customerDocument;
    let customerName = body.customerName;
    let customerEmail = body.customerEmail;
    let customerPhone = body.customerPhone;

    if (isDatabaseConfigured()) {
      try {
        const u = await prisma.user.findUnique({ where: { id: sellerId } });
        if (u) {
          if (!customerDocument && u.document) customerDocument = u.document;
          if (!customerPhone && u.phone) customerPhone = u.phone;
          if (!customerEmail) customerEmail = u.email;
        }
      } catch {
        /* ignore */
      }
    }

    // Postback: URL pública se houver; senão tenta Origin do request (túnel/ngrok)
    const origin =
      req.headers.get("origin") ||
      req.headers.get("x-forwarded-host") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.PODPAY_POSTBACK_BASE_URL ||
      "";
    let postbackBase = process.env.PODPAY_POSTBACK_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "";
    if (!postbackBase && origin) {
      postbackBase = origin.startsWith("http")
        ? origin
        : `https://${origin}`;
    }
    // localhost não recebe webhook da adquirente — sync manual no painel
    if (
      postbackBase.includes("localhost") ||
      postbackBase.includes("127.0.0.1")
    ) {
      postbackBase = process.env.PODPAY_POSTBACK_BASE_URL || "";
    }

    const { createChargeViaPodPay } = await import(
      "@/lib/acquirers/podpay/gateway"
    );
    const { resolvePodPayConfigServer } = await import(
      "@/lib/acquirers/podpay/config"
    );
    const config = await resolvePodPayConfigServer();
    if (!config?.apiKey) {
      return NextResponse.json(
        {
          error: {
            code: "acquirer_not_configured",
            message:
              "Adquirente não configurada. Admin deve salvar sk_live_… em Adquirentes → Credenciais.",
          },
        },
        { status: 503 }
      );
    }
    if (config.env !== "live" && !config.apiKey.includes("live")) {
      // ainda permite sk_test se admin configurou, mas avisa
      console.warn("[payments] usando ambiente sandbox/test da adquirente");
    }

    const charge = await createChargeViaPodPay({
      sellerId,
      amount: body.amount,
      description: body.description,
      customerName: customerName || gate.user.name,
      customerDocument,
      customerEmail: customerEmail || gate.user.email,
      customerPhone,
      postbackUrl: postbackBase
        ? `${postbackBase.replace(/\/$/, "")}/api/v1/webhooks/podpay`
        : undefined,
      config,
    });

    return NextResponse.json(
      {
        id: charge.id,
        status: charge.status,
        amount: charge.amount,
        currency: charge.currency,
        method: charge.method,
        provider: "podpay",
        real: true,
        env: config.env,
        description: charge.description,
        customerName: charge.customerName,
        pix: {
          qrCode: charge.pixQrCode,
          copyPaste: charge.pixCopyPaste,
        },
        expiresAt: charge.expiresAt,
        createdAt: charge.createdAt,
        transactionId: charge.transactionId,
        sellerId: charge.sellerId,
        message:
          "Cobrança PIX real criada. Pague no app do banco; depois clique em Verificar pagamento (ou aguarde o webhook).",
        syncUrl: `/api/v1/payments/${encodeURIComponent(charge.id)}/sync`,
      },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar cobrança";
    return NextResponse.json(
      { error: { code: "charge_failed", message: msg } },
      { status: 400 }
    );
  }
}

export async function GET(req: Request) {
  const gate = await requireSellerAuth(req, { permission: "transacoes" });
  if (isGuardFail(gate)) return gate.error;

  try {
    const items = await listChargesAsync(gate.user.id);
    return NextResponse.json({
      source: "ok",
      items,
      total: items.length,
      sellerId: gate.user.id,
      authVia: gate.authVia,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
