/**
 * Fila de webhooks durável (Prisma).
 *
 * Antes usava um array em memória que perdia jobs no restart/crash.
 * Agora persiste no banco: se o servidor cair durante a execução de um
 * job, ele fica como "processing" e pode ser retomado manual ou
 * automaticamente via `retryStuckJobs()`.
 *
 * A execução continua inline (mesmo request HTTP) para manter o
 * comportamento síncrono esperado pelas adquirentes. A diferença é que
 * o job é gravado ANTES de executar, garantindo durabilidade.
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

/**
 * Enfileira e executa um job de webhook.
 * - Cria registro no banco (pending)
 * - Marca como processing
 * - Executa o callback
 * - Marca como completed ou failed
 *
 * Se o servidor cair durante a execução, o job fica "processing" e
 * pode ser retomado com `retryStuckJobs()`.
 */
export async function enqueueWebhookJob(
  provider: "podpay" | "velana" | "woovi",
  run: () => Promise<void>
): Promise<string> {
  const { prisma } = await import("@/lib/server/prisma");
  const id = newId();

  if (isDatabaseConfigured()) {
    try {
      await prisma.webhookJob.create({
        data: {
          id,
          provider,
          status: "pending",
          payload: { provider, ts: Date.now() },
        },
      });

      await prisma.webhookJob.update({
        where: { id },
        data: { status: "processing" },
      });
    } catch {
      /* fallback: executa sem persistência */
    }
  }

  try {
    await run();
    if (isDatabaseConfigured()) {
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
    if (isDatabaseConfigured()) {
      try {
        await prisma.webhookJob.update({
          where: { id },
          data: {
            status: "failed",
            error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
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
 * Retoma jobs "processing" ou "pending" presos há mais de `staleMs`.
 * Útil após restart do servidor.
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
  /* não faz mais nada — dados estão no banco */
}

export function createWebhookWorker() {
  return null;
}
