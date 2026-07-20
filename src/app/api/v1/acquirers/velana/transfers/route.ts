import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { velanaClient, VelanaError } from "@/lib/acquirers/velana/client";
import { toCents } from "@/lib/acquirers/velana/mappers";
import {
  resolveVelanaConfigForBff,
  velanaNotConfigured,
} from "@/lib/acquirers/velana/server";

/**
 * POST /api/v1/acquirers/velana/transfers
 * Docs: POST /v1/transfers saque/transferência PIX
 * Body: { amount (reais), pixKey, postbackUrl?, recipientId?, externalRef? }
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
      amountCents?: number;
      pixKey?: string;
      postbackUrl?: string;
      recipientId?: number;
      externalRef?: string;
    };

    const amountCents =
      body.amountCents ??
      (body.amount != null ? toCents(Number(body.amount)) : 0);
    if (amountCents < 100) {
      return NextResponse.json(
        { error: "Valor mínimo R$ 1,00", code: "MIN_AMOUNT" },
        { status: 400 }
      );
    }
    if (!body.pixKey?.trim()) {
      return NextResponse.json(
        { error: "pixKey obrigatória", code: "PIX_KEY_REQUIRED" },
        { status: 400 }
      );
    }

    const postback =
      body.postbackUrl ||
      (config.postbackBaseUrl
        ? `${config.postbackBaseUrl.replace(/\/$/, "")}/api/v1/webhooks/velana`
        : undefined);

    const data = await velanaClient.createTransfer(
      {
        amount: amountCents,
        pixKey: body.pixKey.trim(),
        postbackUrl: postback,
        recipientId: body.recipientId,
        externalRef: body.externalRef,
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
