/**
 * Revogação de sessões — usado pelo admin p/ encerrar sessões ativas de um
 * user (conta suspensa, suspeita de comprometimento). Até hoje só existia
 * invalidação cega no reset-password; este service generaliza.
 *
 * Model Session: { id, userId, token, expiresAt, ip, userAgent, createdAt }
 */

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

export interface SessionInfo {
  id: string;
  userId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  current?: boolean;
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

/** Lista sessões ativas (não expiradas) de um user. */
export async function listActiveUserSessions(
  userId: string
): Promise<SessionInfo[]> {
  if (!(await dbOk())) return [];
  const now = new Date();
  const rows = await prisma.session.findMany({
    where: { userId, expiresAt: { gte: now } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }));
}

/** Encerra todas as sessões de um user. */
export async function revokeAllUserSessions(
  userId: string,
  exceptToken?: string
): Promise<number> {
  if (!(await dbOk())) return 0;
  try {
    const r = await prisma.session.deleteMany({
      where: {
        userId,
        ...(exceptToken ? { NOT: { token: exceptToken } } : {}),
      },
    });
    return r.count;
  } catch {
    return 0;
  }
}

/** Encerra todas as sessões expiradas (Limpeza periódica). */
export async function purgeExpiredSessions(): Promise<number> {
  if (!(await dbOk())) return 0;
  try {
    const r = await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return r.count;
  } catch {
    return 0;
  }
}

/** Encerra uma única sessão por id (admin tool). */
export async function revokeSessionById(
  id: string
): Promise<{ ok: boolean }> {
  if (!(await dbOk())) return { ok: false };
  try {
    await prisma.session.delete({ where: { id } });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Encerra sessões antigas mantendo apenas as N mais recentes por user. */
export async function pruneOldSessionsPerUser(
  keep: number
): Promise<number> {
  if (!(await dbOk()) || keep < 1) return 0;
  let removed = 0;
  try {
    const users = await prisma.session.findMany({
      select: { userId: true },
      distinct: ["userId"],
    });
    for (const { userId } of users) {
      const sessions = await prisma.session.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
        take: keep * 10,
      });
      const toRemove = sessions.slice(keep).map((s) => s.id);
      if (!toRemove.length) continue;
      const r = await prisma.session.deleteMany({
        where: { id: { in: toRemove } },
      });
      removed += r.count;
    }
  } catch {
    /* ignore */
  }
  return removed;
}