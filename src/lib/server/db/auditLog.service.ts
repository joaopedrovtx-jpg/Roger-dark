/**
 * Serviço de auditoria genérico — grava em `AuditLog`.
 *
 * Centraliza o helper `audit()` hoje duplicado em `admin-users.service.ts`
 * para que saques, alterações de taxes, login, webhooks etc. usem a mesma
 * fonte. Erros de escrita são silenciosos (auditoria nunca deve derrubar
 * o request principal).
 */

import { randomBytes } from "crypto";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { getClientIp } from "@/lib/server/security";
import type { AuthUser } from "@/lib/domain/types";

export interface AuditContext {
  /** Requisição HTTP(origem de IP e user-agent) */
  req?: Request;
  /** Usuário autenticado (opcional para eventos de webhook/anonymous) */
  actor?: Pick<AuthUser, "id" | "email"> | null;
}

export interface AuditInput {
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown> | unknown;
  ctx?: AuditContext;
}

function newId(prefix = "aud"): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString("base64url")}`;
}

async function dbAvailable(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Registra um evento de auditoria.
 * Retorna `true` quando persistido, `false` caso contrário (silencioso).
 */
export async function audit(input: AuditInput): Promise<boolean> {
  if (!(await dbAvailable())) return false;
  const ctx = input.ctx;
  const ip = ctx?.req ? getClientIp(ctx.req) : undefined;
  const actor = ctx?.actor;

  try {
    await prisma.auditLog.create({
      data: {
        id: newId(),
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        meta: input.meta ? (input.meta as object) : undefined,
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        ip,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export interface ListAuditFilters {
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}

export async function listAuditEvents(
  filters: ListAuditFilters = {}
): Promise<
  Array<{
    id: string;
    action: string;
    actorId: string | null;
    actorEmail: string | null;
    entityType: string | null;
    entityId: string | null;
    ip: string | null;
    createdAt: Date;
    meta: unknown;
  }>
> {
  if (!(await dbAvailable())) return [];
  const { action, actorId, entityType, entityId, limit = 100, offset = 0 } = filters;

  return prisma.auditLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(actorId ? { actorId } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
    skip: Math.max(offset, 0),
  });
}