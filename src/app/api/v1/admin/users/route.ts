import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  getAdminUsersPageMetrics,
  listAdminUsers,
} from "@/lib/server/db/admin-users.service";
import { adminUsersMock } from "@/lib/mock/admin";

export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const page = Number(searchParams.get("page") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? 50);

    const [metrics, list] = await Promise.all([
      getAdminUsersPageMetrics(),
      listAdminUsers({ status, search, page, pageSize }),
    ]);

    if (metrics && list) {
      return NextResponse.json({ source: "mysql", metrics, ...list });
    }

    let items = [...adminUsersMock];
    if (status && status !== "todos") {
      items = items.filter((u) => u.status === status);
    }
    if (search?.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.id.toLowerCase().includes(q)
      );
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const metricsMock = {
      total: adminUsersMock.length,
      ativo: adminUsersMock.filter((u) => u.status === "ativo").length,
      pendente: adminUsersMock.filter((u) => u.status === "pendente").length,
      bloqueado: adminUsersMock.filter((u) => u.status === "bloqueado").length,
      hoje: adminUsersMock.filter(
        (u) => new Date(u.createdAt) >= startOfToday
      ).length,
      novos: adminUsersMock.filter(
        (u) => Date.now() - new Date(u.createdAt).getTime() < 7 * 864e5
      ).length,
    };
    return NextResponse.json({
      source: "mock",
      metrics: metricsMock,
      items,
      total: items.length,
      page,
      pageSize,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
