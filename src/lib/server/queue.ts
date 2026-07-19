import { EventEmitter } from "events";

type JobState = "waiting" | "active" | "completed" | "failed";

interface JobRecord {
  id: string;
  provider: "podpay" | "velana";
  state: JobState;
  createdAt: number;
}

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

  record.state = "active";
  try {
    await run();
    record.state = "completed";
  } catch (err) {
    record.state = "failed";
    throw err;
  }

  emitter.emit("processed", id);
  return id;
}

export function createWebhookWorker() {
  return null;
}

export async function getQueueSize(): Promise<number> {
  return jobs.filter((j) => j.state === "waiting" || j.state === "active").length;
}

export async function closeQueue() {
  jobs.length = 0;
}
