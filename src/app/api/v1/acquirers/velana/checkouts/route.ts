import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { velanaClient, VelanaError } from "@/lib/acquirers/velana/client";
import { toCents } from "@/lib/acquirers/velana/mappers";
import {
  resolveVelanaConfigForBff,
  velanaNotConfigured,
} from "@/lib/acquirers/velana/server";

/**
 * POST /api/v1/acquirers/velana/checkouts
 * Docs: POST /v1/checkouts
 * Body simplificado em reais → monta payload oficial com settings PIX.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const config = await resolveVelanaConfigForBff(req);
    if (!config?.secretKey) {
      return NextResponse.json(velanaNotConfigured(), { status: 503 });
    }

    const body = (await req.json()) as {
      amount?: number;
      description?: string;
      title?: string;
      postbackUrl?: string;
      recipientId?: number;
      raw?: Record<string, unknown>;
    };

    // Permite passar o body completo da Velana em `raw`
    if (body.raw) {
      const data = await velanaClient.createCheckout(
        body.raw as Parameters<typeof velanaClient.createCheckout>[0],
        { config }
      );
      return NextResponse.json(
        { success: true, provider: "velana", data },
        { status: 201 }
      );
    }

    const amountReais = Number(body.amount);
    if (!Number.isFinite(amountReais) || amountReais < 1) {
      return NextResponse.json(
        { error: "amount mínimo R$ 1,00", code: "MIN_AMOUNT" },
        { status: 400 }
      );
    }
    const amountCents = toCents(amountReais);
    const title = (body.title || body.description || "Checkout").slice(0, 200);
    const postback =
      body.postbackUrl ||
      (config.postbackBaseUrl
        ? `${config.postbackBaseUrl.replace(/\/$/, "")}/api/v1/webhooks/velana`
        : undefined);

    // splits obrigatório na API — recipientId 1 = principal da empresa (docs)
    const recipientId = body.recipientId ?? 1;

    const data = await velanaClient.createCheckout(
      {
        amount: amountCents,
        description: body.description,
        postbackUrl: postback,
        items: [
          {
            title,
            unitPrice: amountCents,
            quantity: 1,
            tangible: false,
          },
        ],
        settings: {
          defaultPaymentMethod: "pix",
          requestAddress: false,
          requestPhone: true,
          requestDocument: true,
          traceable: false,
          pix: { enabled: true, expiresInDays: 1 },
          boleto: { enabled: false, expiresInDays: 2 },
          card: {
            enabled: false,
            freeInstallments: 1,
            maxInstallments: 12,
          },
        },
        splits: [{ recipientId, amount: amountCents }],
      },
      { config }
    );

    return NextResponse.json(
      { success: true, provider: "velana", data },
      { status: 201 }
    );
  } catch (e) {
    const err = e as VelanaError;
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Erro",
        code: err.code,
        details: err.details,
      },
      { status: err.status && err.status < 600 ? err.status : 502 }
    );
  }
}
