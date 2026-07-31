/**
 * Replay de webhooks pendentes (`webhook_inbox` no AuditLog).
 *
 * O `webhook-inbox.ts` grava eventos pending antes do apply, mas só
 * expõe leitura (`listPendingInbox`). Este service provê:
 *   - `replayPendingWebhooks()` — re-despacha o payload para o roteador
 *     do provider (podpay/velana/woovi) usando o `apply*Webhook` real,
 *     respeitando idempotência via `recordInbox` (já marked/applied
 *     será pulado).
 *   - `markInboxFailedBatch()` — marca um lote como failed (erro fatal).
 *
 * Importante: o replay **nunca** duplica efeitos colaterais porque o
 * próprio `balance.ts`/gateway é idempotente (charge/transaction já
 * applied retornam early).
 */

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { recordInbox, markInbox } from "@/lib/server/webhook-inbox";
import { log } from "@/lib/server/logger";

export interface ReplayResult {
  inspected: number;
  replayed: number;
  skipped: number;
  failed: number;
  items: Array<{
    id: string;
    provider: string;
    eventName?: string;
    status: "replayed" | "skipped" | "failed";
    error?: string;
  }>;
}

export interface InboxRow {
  id: string;
  provider: "podpay" | "velana" | "woovi";
  payload: unknown;
  eventName: string;
  remoteId?: string;
  eventId?: string;
}

async function dbOk(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Carrega itens pending crus (meta = JSON com status pending + payload). */
export async function loadPendingInbox(
  limit = 50
): Promise<InboxRow[]> {
  if (!(await dbOk())) return [];
  const rows = await prisma.auditLog.findMany({
    where: {
      action: "webhook_inbox",
      NOT: {
        OR: [
          { meta: { path: "$.status", string_contains: "applied" } },
          { meta: { path: "$.status", string_contains: "failed" } },
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 200),
  });

  return rows
    .map((r) => parseInbox(r.id, r.entityType ?? "", r.meta))
    .filter((r): r is InboxRow => r !== null);
}

function parseInbox(
  id: string,
  providerRaw: string,
  meta: unknown
): InboxRow | null {
  const provider = (
    ["podpay", "velana", "woovi"].includes(providerRaw)
      ? providerRaw
      : ""
  ) as InboxRow["provider"];
  if (!provider) return null;
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  return {
    id,
    provider,
    payload: m.payload,
    eventName: String(m.eventName ?? ""),
    remoteId: typeof m.remoteId === "string" ? m.remoteId : undefined,
    eventId: typeof m.eventId === "string" ? m.eventId : undefined,
  };
}

/**
 * Re-despacha os webhooks pendentes via o gateway da adquirente correta.
 *
 * @param limit Quantos itens reprocessar (default 50).
 * @param handler Função injetada que recebe o provider + payload e
 *   aplica os efeitos nopay. Mantemos injetado para evitar import
 *   circular com gateway.ts (cada provider exporta apply*Webhook).
 */
export async function replayPendingWebhooks(
  handler: (row: InboxRow) => Promise<{ ok: boolean; error?: string }>,
  limit = 50
): Promise<ReplayResult> {
  const items = await loadPendingInbox(limit);
  const result: ReplayResult = {
    inspected: items.length,
    replayed: 0,
    skipped: 0,
    failed: 0,
    items: [],
  };

  for (const row of items) {
    try {
      const r = await handler(row);
      if (r.ok) {
        await markInbox(row.id, "applied");
        result.replayed += 1;
        result.items.push({
          id: row.id,
          provider: row.provider,
          eventName: row.eventName,
          status: "replayed",
        });
      } else {
        await markInbox(row.id, "failed", r.error);
        result.failed += 1;
        result.items.push({
          id: row.id,
          provider: row.provider,
          eventName: row.eventName,
          status: "failed",
          error: r.error,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn({ err: msg, inboxId: row.id }, "webhook_replay_row_failed");
      await markInbox(row.id, "failed", msg).catch(() => undefined);
      result.failed += 1;
      result.items.push({
        id: row.id,
        provider: row.provider,
        eventName: row.eventName,
        status: "failed",
        error: msg,
      });
    }
  }

  return result;
}

/** Marca um lote (por ids) explicitamente como failed (erro fatal). */
export async function markInboxFailedBatch(
  ids: string[],
  reason: string
): Promise<{ ok: number }> {
  let ok = 0;
  for (const id of ids) {
    await markInbox(id, "failed", reason).catch(() => undefined);
    ok += 1;
  }
  return { ok };
}

/** Itera fila de WebhookJob (pending/stuck) e limpa. */
export async function clearStuckJobs(stuckBeforeIso: string): Promise<number> {
  if (!(await dbOk())) return 0;
  try {
    const r = await prisma.webhookJob.updateMany({
      where: {
        status: "processing",
        updatedAt: { lt: new Date(stuckBeforeIso) },
      },
      data: { status: "pending" },
    });
    return r.count;
  } catch {
    return 0;
  }
}