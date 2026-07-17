/**
 * Fila simples in-process para processar webhooks em background.
 * Responde 200 rápido e processa o crédito sem bloquear a adquirente.
 *
 * Em serverless multi-instância, substituir por Redis/SQS.
 */

type Job = {
  id: string;
  provider: "podpay" | "velana";
  run: () => Promise<void>;
  enqueuedAt: number;
};

const queue: Job[] = [];
let running = false;

export function enqueueWebhookJob(
  provider: "podpay" | "velana",
  run: () => Promise<void>
): string {
  const id = `${provider}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  queue.push({ id, provider, run, enqueuedAt: Date.now() });
  void drain();
  return id;
}

async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift()!;
    try {
      await job.run();
    } catch (e) {
      const { log } = await import("@/lib/server/logger");
      log.error("webhook_queue_job_failed", {
        provider: job.provider,
        jobId: job.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  running = false;
}

export function webhookQueueSize(): number {
  return queue.length;
}
