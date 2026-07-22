import { NextResponse } from "next/server";
import {
  isGuardFail,
  requireAuth,
  resolveSellerScope,
} from "@/lib/server/guards";
import { reconcilePendingPayments } from "@/lib/server/reconcile-payments";

/**
 * POST /api/v1/payments/reconcile
 * Sincroniza cobranças pendentes do seller com a adquirente (Velana/PodPay).
 * Admin com view-seller pode reconciliar a conta visualizada.
 *
 * Body opcional: { limit?: number }
 */
export async function POST(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  const scope = await resolveSellerScope(req, gate);
  if (isGuardFail(scope)) return scope.error;

  let limit = 20;
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = body.limit;
    }
  } catch {
    /* empty body ok */
  }

  try {
    const result = await reconcilePendingPayments({
      sellerId: scope.sellerId,
      limit,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      message:
        result.paid > 0
          ? `${result.paid} pagamento(s) confirmado(s) na adquirente.`
          : result.checked === 0
            ? "Nenhuma cobrança pendente para reconciliar."
            : "Nenhum pagamento novo confirmado.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na reconciliação";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
