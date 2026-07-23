import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/memory-store";
import {
  isGuardFail,
  requireAuth,
  resolveSellerScope,
} from "@/lib/server/guards";
import { listSellerTransactions } from "@/lib/server/db/seller-transactions.service";

export async function GET(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  const scope = await resolveSellerScope(req, gate);
  if (isGuardFail(scope)) return scope.error;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const page = Number(searchParams.get("page") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? 40);
    const sellerId = scope.sellerId;

    // Reconcilia até 6 pendentes recentes com a adquirente antes de listar
    // (timeouts individuais na Velana; falhas não derrubam a listagem).
    try {
      const { reconcilePendingPayments } = await import(
        "@/lib/server/reconcile-payments"
      );
      await reconcilePendingPayments({ sellerId, limit: 6 });
    } catch {
      /* listagem segue mesmo se sync falhar */
    }

    const fromDb = await listSellerTransactions(sellerId, {
      page,
      pageSize,
      status,
    });
    if (fromDb) {
      return NextResponse.json({ source: "mysql", ...fromDb });
    }

    let items = getStore().transactions.filter(
      (t) => t.sellerId === sellerId && t.kind === "venda"
    );
    if (status) items = items.filter((t) => t.status === status);
    items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const paid = items.filter((t) => t.status === "aprovada");
    const sumBy = (status: string) =>
      items
        .filter((t) => t.status === status)
        .reduce((a, t) => a + t.amount, 0);
    const metrics = {
      pendentes: sumBy("pendente"),
      pagos: sumBy("aprovada"),
      recusados: sumBy("recusada"),
      reembolsos: sumBy("reembolsada"),
      ticketMedio:
        paid.length > 0
          ? paid.reduce((a, t) => a + t.amount, 0) / paid.length
          : 0,
      taxaConversao:
        items.length > 0
          ? Math.round((paid.length / items.length) * 1000) / 10
          : 0,
    };
    return NextResponse.json({
      source: "live",
      metrics,
      items: items.map((t) => ({
        id: t.id,
        date: t.date,
        customer: t.customer ?? "-",
        product: t.product ?? t.description,
        method: "PIX" as const,
        amount: t.amount,
        status: t.status,
      })),
      total: items.length,
      page,
      pageSize,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
