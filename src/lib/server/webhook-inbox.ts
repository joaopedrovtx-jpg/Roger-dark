/**
 * Outbox mínimo de webhooks (sem migration nova).
 *
 * Estratégia: cada webhook é gravado de forma idempotente no AuditLog
 * ANTES de ser aplicado no DB. Se o apply falhar (restart, timeout,
 * DB momentâneo), o evento fica registrado em audit_logs com action
 * `webhook_inbox_pending` e pode ser reprocessado por um job manual
 * (`replayPendingWebhooks()`).
 *
 * Idempotência: usa `eventId` (ou hash do payload) como entityId
 * + `@@unique` implícito via id aleatório; a checagem é feita antes
 * de criar (busca por entityType+entityId) — se já existir, é replay.
 *
 * Em produção, substituir por tabela dedicada + worker durável
 * (Redis/SQS + outbox pattern).
 */
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { log } from "@/lib/server/logger";

type Json = Prisma.InputJsonValue;

export type InboxEvent = {
  provider: "podpay" | "velana";
  eventId?: string;
  eventName: string;
  remoteId?: string;
  payload: unknown;
};

function toJson(value: unknown): Json {
  // Round-trip via JSON para satisfazer InputJsonValue (campos com tipos
  // literais viram strings, mas para o inbox isso é aceitável).
  return JSON.parse(JSON.stringify(value)) as Json;
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString("base64url")}`;
}

function deriveEntityId(evt: InboxEvent): string {
  if (evt.eventId) return evt.eventId;
  // fallback estável: provider + remoteId + eventName
  const { createHash } = require("crypto") as typeof import("crypto");
  return createHash("sha256")
    .update(`${evt.provider}:${evt.remoteId ?? ""}:${evt.eventName}`)
    .digest("hex")
    .slice(0, 40);
}

/**
 * Grava o evento no AuditLog (idempotente). Retorna true se já existia
 * (replay) ou false se foi criado agora. Não bloqueia em erro: loga e segue
 * para não perder a entrega se a tabela audit_logs estiver indisponível.
 */
export async function recordInbox(evt: InboxEvent): Promise<{
  created: boolean;
  inboxId: string;
}> {
  if (!isDatabaseConfigured()) {
    return { created: true, inboxId: "no-db" };
  }
  const entityId = deriveEntityId(evt);
  try {
    const existing = await prisma.auditLog.findFirst({
      where: {
        action: "webhook_inbox",
        entityType: evt.provider,
        entityId,
      },
      select: { id: true },
    });
    if (existing) {
      return { created: false, inboxId: existing.id };
    }
    const row = await prisma.auditLog.create({
      data: {
        id: newId("wbx"),
        action: "webhook_inbox",
        entityType: evt.provider,
        entityId,
        meta: {
          eventName: evt.eventName,
          remoteId: evt.remoteId,
          eventId: evt.eventId,
          status: "pending",
          payload: toJson(evt.payload),
        },
      },
    });
    return { created: true, inboxId: row.id };
  } catch (e) {
    log.warn(
      { err: e instanceof Error ? e.message : String(e), provider: evt.provider },
      "webhook_inbox_record_failed"
    );
    return { created: true, inboxId: "fallback" };
  }
}

/**
 * Marca o inbox como aplicado (status: applied) ou como falho
 * (status: failed + lastError). Idempotente.
 */
export async function markInbox(
  inboxId: string,
  status: "applied" | "failed",
  errMsg?: string
): Promise<void> {
  if (!isDatabaseConfigured() || inboxId === "no-db" || inboxId === "fallback") {
    return;
  }
  try {
    const existing = await prisma.auditLog.findUnique({
      where: { id: inboxId },
      select: { meta: true },
    });
    if (!existing) return;
    const base = (existing.meta && typeof existing.meta === "object"
      ? { ...(existing.meta as Record<string, unknown>) }
      : {}) as Record<string, unknown>;
    const meta: Prisma.InputJsonValue = {
      ...base,
      status,
      processedAt: new Date().toISOString(),
      ...(errMsg ? { lastError: errMsg.slice(0, 500) } : {}),
    };
    await prisma.auditLog.update({
      where: { id: inboxId },
      data: { meta },
    });
  } catch (e) {
    log.warn(
      { err: e instanceof Error ? e.message : String(e), inboxId },
      "webhook_inbox_mark_failed"
    );
  }
}

/**
 * Lista eventos pendentes para reprocessamento manual.
 * Útil em caso de restart ou falha de DB durante o apply.
 */
export async function listPendingInbox(limit = 50): Promise<unknown[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const rows = await prisma.auditLog.findMany({
      where: {
        action: "webhook_inbox",
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows;
  } catch {
    return [];
  }
}
