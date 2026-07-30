import { NextResponse } from "next/server";
import {
  createPixCharge,
} from "@/lib/services/payment-write.service";
import {
  listChargesAsync,
} from "@/lib/services/payment-read.service";
import { isGuardFail, requireSellerAuth } from "@/lib/server/guards";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { createPaymentSchema, formatZodError } from "@/lib/api/schemas";
import { z } from "zod";

export async function POST(req: Request) {
  const gate = await requireSellerAuth(req, { permission: "transacoes" });
  if (isGuardFail(gate)) return gate.error;

  try {
    let body: z.infer<typeof createPaymentSchema>;
    try {
      body = createPaymentSchema.parse(await req.json());
    } catch (e) {
      const msg = e instanceof z.ZodError ? formatZodError(e) : "Requisição inválida";
      return NextResponse.json(
        { error: { code: "validation_error", message: msg } },
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
        const { log } = await import("@/lib/server/logger");
        log.warn({ sellerId }, "payment_fetch_user_defaults_failed");
      }
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

    // UTMify: PIX gerado (waiting_payment) — tracking server-side
    try {
      const { pushSaleToUtmifyBackground } = await import(
        "@/lib/integrations/utmify/service"
      );
      pushSaleToUtmifyBackground({
        sellerId,
        orderId: charge.id,
        status: "waiting_payment",
        amount: charge.amount,
        description: charge.description || body.description,
        customerName: charge.customerName || customerName,
        customerEmail: customerEmail || gate.user.email,
        customerDocument: customerDocument,
        customerPhone: customerPhone,
        metadata: body.metadata as Record<string, unknown> | undefined,
        createdAt: charge.createdAt || new Date().toISOString(),
      });
    } catch {
      /* não bloqueia cobrança */
    }

    const provider = charge.provider || "unknown";
    const routingMode = charge.routingMode || "plataforma";
    // Integração externa (checkout/oferta): não vaza nome da adquirente
    const isExternal = gate.authVia === "api_key";

    return NextResponse.json(
      {
        id: charge.id,
        status: charge.status,
        amount: charge.amount,
        currency: charge.currency,
        method: charge.method,
        ...(isExternal
          ? {}
          : {
              provider,
              routingMode,
              acquirerId: charge.acquirerId,
              authVia: gate.authVia,
              real: provider !== "mock",
            }),
        description: charge.description,
        customerName: charge.customerName,
        pix: {
          qrCode: charge.pixQrCode,
          copyPaste: charge.pixCopyPaste,
        },
        expiresAt: charge.expiresAt,
        createdAt: charge.createdAt,
        transactionId: charge.transactionId,
        ...(isExternal ? {} : { sellerId: charge.sellerId }),
        message: isExternal
          ? "Cobrança PIX criada com sucesso."
          : provider === "mock"
            ? "Cobrança MOCK (ALLOW_MOCK_DATA=1)."
            : "Cobrança PIX criada.",
        syncUrl: `/api/v1/payments/${encodeURIComponent(charge.id)}/sync`,
      },
      { status: 201 }
    );
  } catch (e) {
    // Log completo interno; resposta pública NUNCA expõe adquirente (Woovi/Velana/PodPay)
    const internalMsg = e instanceof Error ? e.message : "Erro ao criar cobrança";
    const errCode =
      e && typeof e === "object" && "code" in e
        ? String((e as { code?: string }).code || "")
        : "";

    try {
      const { log } = await import("@/lib/server/logger");
      log.error(
        {
          code: errCode || "charge_failed",
          message: internalMsg,
          sellerId: gate.user.id,
          authVia: gate.authVia,
        },
        "payment_create_failed"
      );
    } catch {
      /* fallback silencioso */
    }

    const lower = internalMsg.toLowerCase();
    const isValidation =
      lower.includes("valor mínimo") ||
      lower.includes("sellerid") ||
      lower.includes("inválid") ||
      errCode === "MIN_AMOUNT";

    // Checkout / ofertas: só "erro no app de pagamento"
    return NextResponse.json(
      {
        error: {
          code: isValidation ? "validation_error" : "payment_error",
          message: isValidation
            ? "Dados do pagamento inválidos. Verifique o valor e tente novamente."
            : "Erro no app de pagamento. Tente novamente em instantes.",
        },
      },
      { status: isValidation ? 400 : 503 }
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
