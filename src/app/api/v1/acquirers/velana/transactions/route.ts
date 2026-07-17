import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { resolveVelanaConfigServer } from "@/lib/acquirers/velana/config";
import { velanaClient, VelanaError } from "@/lib/acquirers/velana/client";
import { buildVelanaPixPayload } from "@/lib/acquirers/velana/gateway";
import { toCents } from "@/lib/acquirers/velana/mappers";

/**
 * POST /api/v1/acquirers/velana/transactions
 * Cria PIX real na conta Velana (Admin / teste da integração).
 *
 * Body: { amount, description?, customerName?, customerEmail?, customerPhone?, customerDocument? }
 * Auth API Velana: Basic base64(secretKey:x) — secret do Admin → Credenciais.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const config = await resolveVelanaConfigServer();
    if (!config?.secretKey) {
      return NextResponse.json(
        {
          error:
            "Velana sem secret key. Salve pk_ + sk_ em Admin → Adquirentes → Credenciais.",
          code: "VELANA_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const body = (await req.json()) as {
      amount?: number;
      description?: string;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      customerDocument?: string;
    };

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 1) {
      return NextResponse.json(
        { error: "amount mínimo R$ 1,00", code: "MIN_AMOUNT" },
        { status: 400 }
      );
    }

    const amountCents = toCents(amount);
    const postback = config.postbackBaseUrl
      ? `${config.postbackBaseUrl.replace(/\/$/, "")}/api/v1/webhooks/velana`
      : undefined;

    const dto = buildVelanaPixPayload({
      sellerId: gate.user.id,
      amount,
      amountCents,
      description: body.description || "Teste PIX Velana",
      customerName: body.customerName || gate.user.name || "Cliente",
      customerEmail: body.customerEmail || gate.user.email || "cliente@email.com",
      customerPhone: body.customerPhone,
      customerDocument: body.customerDocument,
      postbackUrl: postback,
      externalRef: `admin-test-${Date.now()}`,
    });

    const tx = await velanaClient.createTransaction(dto, { config });

    return NextResponse.json({
      ok: true,
      provider: "velana",
      auth: "Basic secretKey:x",
      id: tx.id,
      status: tx.status,
      amount: tx.amount,
      paymentMethod: tx.paymentMethod,
      pix: tx.pix,
      secureUrl: tx.secureUrl,
      raw: tx,
    });
  } catch (e) {
    const err = e as VelanaError;
    const msg = e instanceof Error ? e.message : "Erro Velana";
    const status =
      err.status && err.status >= 400 && err.status < 600 ? err.status : 400;
    return NextResponse.json(
      {
        error: msg,
        code: err.code || "VELANA_ERROR",
        details: err.details,
      },
      { status }
    );
  }
}

/** GET — lista transações remotas na Velana */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const config = await resolveVelanaConfigServer();
    if (!config?.secretKey) {
      return NextResponse.json(
        { error: "Velana não configurada", code: "VELANA_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    const url = new URL(req.url);
    const data = await velanaClient.listTransactions({
      page: Number(url.searchParams.get("page") || "1") || 1,
      status: url.searchParams.get("status") || undefined,
      paymentMethods: url.searchParams.get("paymentMethods") || "pix",
      config,
    });
    return NextResponse.json({ ok: true, provider: "velana", data });
  } catch (e) {
    const err = e as VelanaError;
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json(
      { error: msg, code: err.code, details: err.details },
      { status: err.status && err.status < 600 ? err.status : 400 }
    );
  }
}
