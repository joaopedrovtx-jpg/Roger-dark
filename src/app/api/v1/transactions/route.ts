import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/memory-store";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import { listSellerTransactions } from "@/lib/server/db/seller.service";

/** GET /api/v1/transactions */
export async function GET(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const page = Number(searchParams.get("page") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? 40);
    const sellerId = gate.user.id;

    const fromDb = await listSellerTransactions(sellerId, {
      page,
      pageSize,
      status,
    });
    if (fromDb) {
      return NextResponse.json({ source: "mysql", ...fromDb });
    }

    // Sem banco: só o que foi criado nesta sessão via PodPay (sem seed de teste)
    let items = getStore().transactions.filter(
      (t) => t.sellerId === sellerId && t.kind === "venda"
    );
    if (status) items = items.filter((t) => t.status === status);
    items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const paid = items.filter((t) => t.status === "aprovada");
    const metrics = {
      pendentes: items.filter((t) => t.status === "pendente").length,
      pagos: paid.length,
      recusados: items.filter((t) => t.status === "recusada").length,
      reembolsos: items.filter((t) => t.status === "reembolsada").length,
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
        customer: t.customer ?? "—",
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
