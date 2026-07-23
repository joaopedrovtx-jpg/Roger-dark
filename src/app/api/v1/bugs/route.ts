import { NextResponse } from "next/server";
import { reportBug } from "@/lib/server/bug-log";
import { getSessionUser } from "@/lib/server/auth";
import {
  checkLoginRateLimit,
  getClientIp,
  securityHeaders,
} from "@/lib/server/security";

/**
 * POST /api/v1/bugs — cliente (e tools) reportam erros.
 * Autenticação opcional; se houver cookie, associa userId/email.
 */
export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    // rate limit simples reutilizando chave de login por IP
    const rate = await checkLoginRateLimit({ ip, email: `bug:${ip}` });
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Muitos reports. Tente mais tarde." },
        { status: 429, headers: securityHeaders() }
      );
    }

    let body: {
      source?: string;
      message?: string;
      stack?: string;
      route?: string;
      method?: string;
      statusCode?: number;
      code?: string;
      meta?: Record<string, unknown>;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "JSON inválido" },
        { status: 400, headers: securityHeaders() }
      );
    }

    const message = String(body.message || "").trim();
    if (!message || message.length > 500) {
      return NextResponse.json(
        { error: "message obrigatório (máx. 500)" },
        { status: 400, headers: securityHeaders() }
      );
    }

    let userId: string | null = null;
    let userEmail: string | null = null;
    try {
      const user = await getSessionUser(req);
      if (user) {
        userId = user.id;
        userEmail = user.email;
      }
    } catch {
      /* ignore */
    }

    const bugId = await reportBug({
      source: body.source === "client" ? "client" : "server",
      level: "error",
      message,
      stack: body.stack,
      route: body.route,
      method: body.method,
      statusCode: body.statusCode,
      code: body.code,
      userId,
      userEmail,
      ip,
      userAgent: req.headers.get("user-agent"),
      meta: body.meta ?? null,
    });

    return NextResponse.json(
      { ok: true, id: bugId },
      { status: 201, headers: securityHeaders() }
    );
  } catch {
    return NextResponse.json(
      { error: "Falha ao registrar bug" },
      { status: 500, headers: securityHeaders() }
    );
  }
}
