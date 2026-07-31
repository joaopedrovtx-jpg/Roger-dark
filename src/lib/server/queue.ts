/**
 * Fila de webhooks durável (Prisma WebhookJob).
 *
 * Execução inline (mesmo request) — as adquirentes esperam 200 após processar.
 * Persistência grava o job ANTES de executar para forense e detecção de stuck.
 */

import { randomBytes } from "crypto";
import { isDatabaseConfigured } from "@/lib/server/prisma";
import { log } from "@/lib/server/logger";

function newId(): string {
  return `wj_${Date.now().toString(36)}_${randomBytes(6).toString("base64url")}`;
}

export type WebhookJobData = {
  provider: "podpay" | "velana" | "woovi";
  payload: unknown;
};

export type WithdrawalJobData = {
  withdrawalId: string;
  sellerId: string;
  amount: number;
  provider: string;
};

function safePayloadPreview(payload: unknown): Record<string, unknown> {
  try {
    if (payload == null) return { ts: Date.now() };
    if (typeof payload !== "object") {
      return { ts: Date.now(), kind: typeof payload };
    }
    const obj = payload as Record<string, unknown>;
    // Evita gravar secrets / bodies gigantes — só metadados úteis.
    const keys = Object.keys(obj).slice(0, 24);
    return {
      ts: Date.now(),
      keys,
      id: obj.id ?? obj.eventId ?? obj.chargeId ?? obj.transactionId ?? null,
      type: obj.type ?? obj.event ?? obj.status ?? null,
    };
  } catch {
    return { ts: Date.now() };
  }
}

/**
 * Enfileira e executa um job de webhook com persistência best-effort.
 * @param meta opcional — payload resumido p/ forense (não o body bruto completo)
 */
export async function enqueueWebhookJob(
  provider: "podpay" | "velana" | "woovi",
  run: () => Promise<void>,
  meta?: unknown
): Promise<string> {
  const { prisma } = await import("@/lib/server/prisma");
  const id = newId();
  let persisted = false;

  if (isDatabaseConfigured()) {
    try {
      await prisma.webhookJob.create({
        data: {
          id,
          provider,
          status: "pending",
          payload: safePayloadPreview(meta ?? { provider }) as object,
        },
      });
      await prisma.webhookJob.update({
        where: { id },
        data: { status: "processing" },
      });
      persisted = true;
    } catch (e) {
      log.warn(
        {
          provider,
          err: e instanceof Error ? e.message : String(e),
        },
        "webhook_job_persist_failed"
      );
    }
  }

  try {
    await run();
    if (persisted) {
      try {
        await prisma.webhookJob.update({
          where: { id },
          data: { status: "completed" },
        });
      } catch {
        /* best-effort */
      }
    }
  } catch (err) {
    if (persisted) {
      try {
        await prisma.webhookJob.update({
          where: { id },
          data: {
            status: "failed",
            error:
              err instanceof Error
                ? err.message.slice(0, 500)
                : String(err).slice(0, 500),
          },
        });
      } catch {
        /* best-effort */
      }
    }
    throw err;
  }

  return id;
}

/**
 * Marca jobs pending/processing antigos como `stuck` (observabilidade).
 * Não reexecuta — webhooks de adquirente já usam replay/idempotência no crédito.
 */
export async function retryStuckJobs(staleMs = 60_000): Promise<number> {
  const { prisma } = await import("@/lib/server/prisma");
  if (!isDatabaseConfigured()) return 0;

  const cutoff = new Date(Date.now() - staleMs);
  try {
    const result = await prisma.webhookJob.updateMany({
      where: {
        status: { in: ["pending", "processing"] },
        createdAt: { lt: cutoff },
      },
      data: { status: "stuck" },
    });
    if (result.count > 0) {
      log.warn({ count: result.count }, "webhook_jobs_marked_stuck");
    }
    return result.count;
  } catch {
    return 0;
  }
}

export async function getQueueSize(): Promise<number> {
  const { prisma } = await import("@/lib/server/prisma");
  if (!isDatabaseConfigured()) return 0;
  try {
    return await prisma.webhookJob.count({
      where: { status: { in: ["pending", "processing"] } },
    });
  } catch {
    return 0;
  }
}

export async function closeQueue() {
  /* no-op — dados no banco */
}

export function createWebhookWorker() {
  return null;
}
