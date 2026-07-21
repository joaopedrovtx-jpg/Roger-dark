import { EventEmitter } from "events";

type JobState = "waiting" | "active" | "completed" | "failed";

interface JobRecord {
  id: string;
  provider: "podpay" | "velana";
  state: JobState;
  createdAt: number;
}

// Limite de records em memória para evitar leak. Jobs antigos além desse
// limite são descartados (não comprometem a lógica porque a fila é inline).
const MAX_RETAINED_RECORDS = 200;

const jobs: JobRecord[] = [];
const emitter = new EventEmitter();
let counter = 0;

export type WebhookJobData = {
  provider: "podpay" | "velana";
  payload: unknown;
};

export type WithdrawalJobData = {
  withdrawalId: string;
  sellerId: string;
  amount: number;
  provider: string;
};

/**
 * DP-V3-13: a fila roda INLINE no mesmo processo do request.
 * Em produção isso é resiliente para o caso de uso atual (credit idempotente
 * Prisma) porque: se a chamada de DB falhar, o webhook retorna 500 e a
 * adquirente reenvia (replay idempotente). Mas em multi-instance ou
 * restart antes do commit, o trabalho entre `run()` start e o `await
 * prisma.$transaction` é perdido.
 *
 * TODO produção: substituir por Redis/SQS + outbox pattern. Por ora
 * mantemos o early-await para garantir que o `applyWebhookToMysql`
 * executa antes de responder 200 à adquirente.
 */
export async function enqueueWebhookJob(
  provider: "podpay" | "velana",
  run: () => Promise<void>
): Promise<string> {
  const id = `webhook_${++counter}`;

  const record: JobRecord = {
    id,
    provider,
    state: "waiting",
    createdAt: Date.now(),
  };
  jobs.push(record);

  // Evita crescimento ilimitado do array.
  while (jobs.length > MAX_RETAINED_RECORDS) {
    const idx = jobs.findIndex(
      (j) => j.state === "completed" || j.state === "failed"
    );
    if (idx >= 0) jobs.splice(idx, 1);
    else break;
  }

  record.state = "active";
  try {
    await run();
    record.state = "completed";
  } catch (err) {
    record.state = "failed";
    // Não limpa o record: o replay idempotente da adquirente vai reenfileirar
    throw err;
  }

  emitter.emit("processed", id);
  return id;
}

export function createWebhookWorker() {
  // TODO produção: instanciar worker de fila durável.
  return null;
}

export async function getQueueSize(): Promise<number> {
  return jobs.filter((j) => j.state === "waiting" || j.state === "active").length;
}

export async function closeQueue() {
  jobs.length = 0;
}
