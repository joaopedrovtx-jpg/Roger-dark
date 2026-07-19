import { NextResponse } from "next/server";
import {
  createPixCharge,
} from "@/lib/services/payment-write.service";
import {
  listChargesAsync,
} from "@/lib/services/payment-read.service";
import { isGuardFail, requireSellerAuth } from "@/lib/server/guards";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

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
      } catch { /* ignore */ }
    }

    const charge = await createPixCharge({
      sellerId,
      amount: body.amount,
      description: body.description,
      customerName: customerName || gate.user.name,
      customerDocument,
      customerEmail: customerEmail || gate.user.email,
      customerPhone,
      metadata: body.metadata,
    });

    const provider = charge.provider || "unknown";
    const routingMode = charge.routingMode || "plataforma";

    return NextResponse.json(
      {
        id: charge.id,
        status: charge.status,
        amount: charge.amount,
        currency: charge.currency,
        method: charge.method,
        provider,
        routingMode,
        acquirerId: charge.acquirerId,
        authVia: gate.authVia,
        real: provider !== "mock",
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
        sellerEmail: gate.user.email,
        message:
          provider === "mock"
            ? "Cobrança MOCK (ALLOW_MOCK_DATA=1)."
            : routingMode === "personalizado"
              ? `Cobrança PIX via ${provider} (rota personalizada de ${gate.user.email}).`
              : `Cobrança PIX via ${provider} (principal da plataforma · conta ${gate.user.email}).`,
        syncUrl: `/api/v1/payments/${encodeURIComponent(charge.id)}/sync`,
      },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao criar cobrança";
    const isConfig =
      /não configurada|not configured|Adquirente/i.test(msg);
    return NextResponse.json(
      {
        error: {
          code: isConfig ? "acquirer_not_configured" : "charge_failed",
          message: msg,
        },
      },
      { status: isConfig ? 503 : 400 }
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
