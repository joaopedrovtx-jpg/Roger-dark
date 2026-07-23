/**
 * Bug log — grava erros com contexto (rota, user, stack, meta)
 * para diagnóstico em produção sem depender só do pm2 logs.
 */
import { randomBytes } from "crypto";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { log } from "@/lib/server/logger";

export type BugSource = "server" | "client";
export type BugLevel = "error" | "warn" | "info";

export type BugReportInput = {
  source?: BugSource;
  level?: BugLevel;
  message: string;
  stack?: string | null;
  route?: string | null;
  method?: string | null;
  statusCode?: number | null;
  code?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
};

function newId() {
  return `bug_${randomBytes(12).toString("base64url")}`;
}

function clip(s: string | null | undefined, max: number): string | null {
  if (s == null) return null;
  const t = String(s);
  return t.length > max ? t.slice(0, max) : t;
}

/** Persiste bug no MySQL + espelha no pino (pm2). Nunca lança. */
export async function reportBug(input: BugReportInput): Promise<string | null> {
  const id = newId();
  const payload = {
    id,
    source: input.source || "server",
    level: input.level || "error",
    message: clip(input.message, 500) || "Erro desconhecido",
    stack: clip(input.stack, 8000),
    route: clip(input.route, 250),
    method: clip(input.method, 16),
    statusCode: input.statusCode ?? null,
    code: clip(input.code, 64),
    userId: clip(input.userId, 64),
    userEmail: clip(input.userEmail, 191),
    requestId: clip(input.requestId, 64),
    ip: clip(input.ip, 64),
    userAgent: clip(input.userAgent, 500),
    meta: input.meta ?? undefined,
  };

  try {
    log.error(
      {
        event: "bug_log",
        bugId: id,
        source: payload.source,
        route: payload.route,
        method: payload.method,
        statusCode: payload.statusCode,
        code: payload.code,
        userId: payload.userId,
        message: payload.message,
      },
      "bug_log"
    );
  } catch {
    /* ignore */
  }

  if (!isDatabaseConfigured()) return id;

  try {
    await prisma.bugLog.create({
      data: {
        id: payload.id,
        source: payload.source,
        level: payload.level,
        message: payload.message,
        stack: payload.stack,
        route: payload.route,
        method: payload.method,
        statusCode: payload.statusCode,
        code: payload.code,
        userId: payload.userId,
        userEmail: payload.userEmail,
        requestId: payload.requestId,
        ip: payload.ip,
        userAgent: payload.userAgent,
        meta: payload.meta as object | undefined,
      },
    });
  } catch (e) {
    // tabela pode não existir ainda — só loga
    try {
      log.warn(
        {
          event: "bug_log_persist_failed",
          err: e instanceof Error ? e.message : String(e),
          bugId: id,
        },
        "bug_log_persist_failed"
      );
    } catch {
      /* ignore */
    }
  }

  return id;
}

/** Atalho para erros de route handler */
export async function reportRouteError(opts: {
  req: Request;
  err: unknown;
  route: string;
  statusCode?: number;
  userId?: string | null;
  userEmail?: string | null;
  meta?: Record<string, unknown>;
}): Promise<string | null> {
  const err = opts.err;
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Erro interno";
  const stack = err instanceof Error ? err.stack : null;
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code || "")
      : null;

  let ip: string | null = null;
  try {
    const { getClientIp } = await import("@/lib/server/security");
    ip = getClientIp(opts.req);
  } catch {
    ip = opts.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  }

  return reportBug({
    source: "server",
    level: "error",
    message,
    stack,
    route: opts.route,
    method: opts.req.method,
    statusCode: opts.statusCode ?? 500,
    code: code || null,
    userId: opts.userId,
    userEmail: opts.userEmail,
    ip,
    userAgent: opts.req.headers.get("user-agent"),
    meta: opts.meta,
  });
}
