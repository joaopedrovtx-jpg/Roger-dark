import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import { prisma } from "@/lib/server/prisma";
import { securityHeaders } from "@/lib/server/security";

/**
 * GET /api/v1/admin/bugs?limit=50&route=/api/v1/documents&source=server
 * Lista bugs recentes (admin/gerente).
 */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    100,
    Math.max(1, Number(searchParams.get("limit") || 40))
  );
  const route = searchParams.get("route") || undefined;
  const source = searchParams.get("source") || undefined;

  try {
    const items = await prisma.bugLog.findMany({
      where: {
        ...(route ? { route: { contains: route } } : {}),
        ...(source ? { source } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(
      {
        items: items.map((b) => ({
          id: b.id,
          source: b.source,
          level: b.level,
          message: b.message,
          stack: b.stack,
          route: b.route,
          method: b.method,
          statusCode: b.statusCode,
          code: b.code,
          userId: b.userId,
          userEmail: b.userEmail,
          ip: b.ip,
          userAgent: b.userAgent,
          meta: b.meta,
          createdAt: b.createdAt.toISOString(),
        })),
        total: items.length,
      },
      { headers: securityHeaders() }
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Falha ao listar bugs",
        hint: "Tabela bug_logs pode não existir ainda — rode o deploy/migration.",
      },
      { status: 500, headers: securityHeaders() }
    );
  }
}
