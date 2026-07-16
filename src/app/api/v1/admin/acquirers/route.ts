import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  getAdminAcquirersMetrics,
  listAdminAcquirers,
} from "@/lib/server/db/admin.service";
import { adquirentesMock } from "@/lib/mock/admin";

/** GET /api/v1/admin/acquirers — Gerenciamento + base das Credenciais */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;
  try {
    const [metrics, items] = await Promise.all([
      getAdminAcquirersMetrics(),
      listAdminAcquirers(),
    ]);

    if (metrics && items) {
      return NextResponse.json({
        source: "mysql",
        metrics,
        items,
        total: items.length,
      });
    }

    const volume = adquirentesMock.reduce((a, x) => a + x.volumeMes, 0);
    const txs = adquirentesMock.reduce((a, x) => a + x.transactionsMes, 0);
    const taxasPagas = adquirentesMock.reduce(
      (a, x) =>
        a + x.volumeMes * (x.feePercent / 100) + x.transactionsMes * x.feeFixed,
      0
    );
    return NextResponse.json({
      source: "mock",
      metrics: {
        volume,
        txs,
        total: adquirentesMock.length,
        ativos: adquirentesMock.filter((x) => x.status === "ativo").length,
        manutencao: adquirentesMock.filter((x) => x.status === "manutencao")
          .length,
        inativos: adquirentesMock.filter((x) => x.status === "inativo").length,
        taxasPagas,
        ticketMedio: txs > 0 ? volume / txs : 0,
      },
      items: adquirentesMock,
      total: adquirentesMock.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
