import { isDatabaseConfigured, prisma } from "@/lib/server/prisma";

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

async function audit(
  action: string,
  entityType?: string,
  entityId?: string,
  meta?: unknown
) {
  if (!(await dbAvailable())) return;
  try {
    await prisma.auditLog.create({
      data: {
        id: newId("aud"),
        action,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        meta: meta ? (meta as object) : undefined,
      },
    });
  } catch { /* ignore audit failures */ }
}

export async function getAdminUsersPageMetrics() {
  if (!(await dbAvailable())) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5);

  const [total, ativo, pendente, bloqueado, hoje, novos] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ativo" } }),
    prisma.user.count({ where: { status: "pendente" } }),
    prisma.user.count({ where: { status: "bloqueado" } }),
    prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
  ]);

  return { total, ativo, pendente, bloqueado, hoje, novos };
}

export async function listAdminUsers(opts?: {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  if (!(await dbAvailable())) return null;
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 50;
  const where: Record<string, unknown> = {};
  if (opts?.status && opts.status !== "todos") {
    where.status = opts.status;
  }
  if (opts?.search?.trim()) {
    const q = opts.search.trim();
    where.OR = [
      { name: { contains: q } },
      { email: { contains: q } },
      { id: { contains: q } },
      { document: { contains: q } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        acquirerLinks: { where: { enabled: true } },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    items: items.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      document: u.document ?? "",
      phone: u.phone ?? "",
      status: u.status,
      createdAt: u.createdAt.toISOString(),
      balance: n(u.balanceAvailable),
      heldBalance: n(u.balanceHeld),
      volumeTotal: n(u.volumeTotal),
      platformProfit: n(u.platformProfit),
      personType: u.personType,
      displayName: u.displayName,
      company: u.company,
      cnpj: u.cnpj,
      address: u.address,
      city: u.city,
      state: u.state,
      zip: u.zip,
      saqueAutomatico: u.saqueAutomatico,
      routingMode: u.routingMode,
      preferredAdquirenteId: u.preferredAdquirenteId,
      adquirenteIds: u.acquirerLinks.map((l) => l.acquirerId),
      fees: {
        mdrPercent: n(u.mdrPercent),
        mdrFixed: n(u.mdrFixed),
        saquePercent: n(u.saquePercent),
        saqueFixed: n(u.saqueFixed),
      },
    })),
  };
}

export async function dbUpdateUserStatus(
  id: string,
  status: "ativo" | "pendente" | "bloqueado"
) {
  if (!(await dbAvailable())) return null;
  const u = await prisma.user.update({
    where: { id },
    data: { status },
  });
  await audit("user.status", "user", id, { status });
  return { id: u.id, status: u.status };
}

export async function dbUpdateUserFees(
  id: string,
  fees: {
    mdrPercent: number;
    mdrFixed: number;
    saquePercent: number;
    saqueFixed: number;
  }
) {
  if (!(await dbAvailable())) return null;
  const u = await prisma.user.update({
    where: { id },
    data: {
      mdrPercent: fees.mdrPercent,
      mdrFixed: fees.mdrFixed,
      saquePercent: fees.saquePercent,
      saqueFixed: fees.saqueFixed,
    },
  });
  await audit("user.fees", "user", id, fees);
  return {
    id: u.id,
    fees: {
      mdrPercent: n(u.mdrPercent),
      mdrFixed: n(u.mdrFixed),
      saquePercent: n(u.saquePercent),
      saqueFixed: n(u.saqueFixed),
    },
  };
}

export async function dbUpdateUserRouting(
  id: string,
  data: {
    saqueAutomatico?: boolean;
    routingMode?: string;
    preferredAdquirenteId?: string | null;
    adquirenteIds?: string[];
  }
) {
  if (!(await dbAvailable())) return null;

  const mode =
    data.routingMode === "personalizado" || data.routingMode === "plataforma"
      ? data.routingMode
      : undefined;

  const preferred =
    data.preferredAdquirenteId === null
      ? null
      : data.preferredAdquirenteId !== undefined
        ? data.preferredAdquirenteId
        : undefined;

  const u = await prisma.user.update({
    where: { id },
    data: {
      ...(data.saqueAutomatico !== undefined
        ? { saqueAutomatico: data.saqueAutomatico }
        : {}),
      ...(mode ? { routingMode: mode } : {}),
      ...(preferred !== undefined ? { preferredAdquirenteId: preferred } : {}),
    },
  });
  if (data.adquirenteIds) {
    await prisma.userAcquirer.deleteMany({ where: { userId: id } });
    if (data.adquirenteIds.length) {
      await prisma.userAcquirer.createMany({
        data: data.adquirenteIds.map((acquirerId) => ({
          userId: id,
          acquirerId,
          enabled: true,
        })),
      });
    }
  }
  await audit("user.routing", "user", id, data);
  return {
    id: u.id,
    routingMode: u.routingMode,
    preferredAdquirenteId: u.preferredAdquirenteId,
    saqueAutomatico: u.saqueAutomatico,
  };
}

export async function dbSetUserDocumentsStatus(
  userId: string,
  status: "aprovado" | "pendente" | "rejeitado"
) {
  if (!(await dbAvailable())) return null;
  await prisma.document.updateMany({
    where: { userId },
    data: {
      status,
      reviewedAt: new Date(),
    },
  });
  await audit("documents.bulk", "user", userId, { status });
  return { ok: true };
}
