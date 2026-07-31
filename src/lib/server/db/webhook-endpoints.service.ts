/**
 * Gerencia endpoints de webhook OUTBOUND (notificações DarkPay → aplicação
 * do seller). Modelos `WebhookEndpoint` + `WebhookDelivery` já existem no
 * schema, mas faltava um service central — as páginas usavam só localStorage.
 *
 * Eventos suportados (padrão DarkPay):
 *   sale.paid, sale.refunded, sale.expired, withdrawal.paid,
 *   withdrawal.failed, doc.reviewed
 */

import { randomBytes, createHmac } from "crypto";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

export type WebhookEvent =
  | "sale.paid"
  | "sale.refunded"
  | "sale.expired"
  | "withdrawal.paid"
  | "withdrawal.failed"
  | "doc.reviewed"
  | "*";

export interface WebhookEndpointView {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secretHint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEndpointInput {
  userId: string;
  url: string;
  events?: string[];
  active?: boolean;
}

export interface UpdateEndpointInput {
  url?: string;
  events?: string[];
  active?: boolean;
  secret?: string;
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function secretHint(s?: string | null): string | undefined {
  if (!s) return undefined;
  return s.slice(0, 4) + "…" + s.slice(-2);
}

export async function listWebhookEndpoints(
  userId: string
): Promise<WebhookEndpointView[]> {
  if (!(await dbOk())) return [];
  const rows = await prisma.webhookEndpoint.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    events: parseEvents(r.events),
    active: r.active,
    secretHint: r.secret ? secretHint(r.secret) : undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export interface CreateEndpointResult {
  ok: boolean;
  endpoint?: WebhookEndpointView & { secret?: string };
  error?: string;
}

export async function createWebhookEndpoint(
  input: CreateEndpointInput
): Promise<CreateEndpointResult> {
  if (!isValidUrl(input.url)) {
    return { ok: false, error: "URL inválida (use https://)" };
  }
  if (!(await dbOk())) {
    return { ok: false, error: "Banco de dados indisponível" };
  }
  const id = `wh_${Date.now().toString(36)}_${randomBytes(6).toString("base64url")}`;
  const secret = randomBytes(24).toString("hex");
  const events = input.events?.length ? input.events : ["*"];

  const row = await prisma.webhookEndpoint.create({
    data: {
      id,
      userId: input.userId,
      url: input.url,
      secret,
      events,
      active: input.active ?? true,
    },
  });

  return {
    ok: true,
    endpoint: {
      id: row.id,
      url: row.url,
      events: parseEvents(row.events),
      active: row.active,
      secretHint: secretHint(row.secret ?? undefined),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      secret,
    },
  };
}

export async function updateWebhookEndpoint(
  id: string,
  userId: string,
  patch: UpdateEndpointInput
): Promise<{ ok: boolean; error?: string }> {
  if (!(await dbOk())) return { ok: false, error: "Banco indisponível" };
  const own = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!own || own.userId !== userId) {
    return { ok: false, error: "Webhook não encontrado" };
  }
  const data: Record<string, unknown> = {};
  if (patch.url !== undefined) {
    if (!isValidUrl(patch.url)) return { ok: false, error: "URL inválida" };
    data.url = patch.url;
  }
  if (patch.events !== undefined) data.events = patch.events;
  if (patch.active !== undefined) data.active = patch.active;
  if (typeof patch.secret === "string" && patch.secret.length >= 8) {
    data.secret = patch.secret;
  } else if (patch.secret === "") {
    data.secret = null;
  }
  await prisma.webhookEndpoint.update({ where: { id }, data });
  return { ok: true };
}

export async function deleteWebhookEndpoint(
  id: string,
  userId: string
): Promise<{ ok: boolean }> {
  if (!(await dbOk())) return { ok: false };
  const own = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!own || own.userId !== userId) return { ok: false };
  await prisma.webhookEndpoint.delete({ where: { id } });
  return { ok: true };
}

export interface DeliverInput {
  endpointId: string;
  event: string;
  payload: unknown;
}

/**
 * Entrega um webhook OUTBOUND: HMAC body (sha256), retries via `attempts`.
 * Não-jamanta — útil em fila. Retorna o Delivery criado.
 */
export async function deliverWebhook(
  input: DeliverInput
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  if (!(await dbOk())) return { ok: false, error: "Banco indisponível" };
  const ep = await prisma.webhookEndpoint.findUnique({
    where: { id: input.endpointId },
  });
  if (!ep || !ep.active) return { ok: false, error: "Endpoint inativo" };

  const body = JSON.stringify(input.payload);
  const signature = ep.secret
    ? createHmac("sha256", ep.secret).update(body).digest("hex")
    : undefined;

  let statusCode: number | undefined;
  let lastError: string | undefined;

  try {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signature ? { "X-DarkPay-Signature": signature } : {}),
        "X-DarkPay-Event": input.event,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = res.status;
    if (!res.ok) lastError = `HTTP ${res.status}`;
  } catch (e) {
    lastError = e instanceof Error ? e.message : "fetch errored";
  }

  const success = statusCode !== undefined && statusCode >= 200 && statusCode < 300;

  await prisma.webhookDelivery.create({
    data: {
      id: `deliver_${Date.now().toString(36)}_${randomBytes(4).toString("base64url")}`,
      endpointId: ep.id,
      event: input.event,
      payload: input.payload as object,
      statusCode: statusCode ?? null,
      success,
      attempts: 1,
      lastError: lastError ?? null,
      deliveredAt: success ? new Date() : null,
    },
  });

  return { ok: success, statusCode, error: lastError };
}

function parseEvents(raw: unknown): string[] {
  try {
    if (Array.isArray(raw)) return raw.map((r) => String(r));
    if (typeof raw === "string") return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
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