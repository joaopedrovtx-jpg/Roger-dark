import { randomBytes } from "crypto";
import { isDatabaseConfigured, prisma } from "@/lib/server/prisma";
import { notifyDocReview } from "@/lib/server/notify-email";

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

function newId(prefix: string) {
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

/** Roles do user (JSON SQLite/MySQL) */
function parseUserRoles(raw: unknown): string[] {
  try {
    let value: unknown = raw;
    if (typeof raw === "string") {
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw.split(",").map((s) => s.trim());
      }
    }
    if (Array.isArray(value)) {
      return value.map((r) => String(r).toLowerCase());
    }
  } catch {
    /* ignore */
  }
  return ["seller"];
}

/** Super-admin da plataforma não entra na lista de sellers */
function isPlatformSuperAdmin(rolesRaw: unknown, email?: string | null): boolean {
  const roles = parseUserRoles(rolesRaw);
  if (roles.includes("admin")) return true;
  const e = (email || "").toLowerCase();
  if (e === "admin@darkpay.app") return true;
  return false;
}

export async function getAdminUsersPageMetrics() {
  if (!(await dbAvailable())) return null;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5);

  const all = await prisma.user.findMany({
    select: {
      status: true,
      createdAt: true,
      roles: true,
      email: true,
    },
  });
  const sellers = all.filter((u) => !isPlatformSuperAdmin(u.roles, u.email));

  return {
    total: sellers.length,
    ativo: sellers.filter((u) => u.status === "ativo").length,
    pendente: sellers.filter((u) => u.status === "pendente").length,
    bloqueado: sellers.filter((u) => u.status === "bloqueado").length,
    hoje: sellers.filter((u) => u.createdAt >= startOfToday).length,
    novos: sellers.filter((u) => u.createdAt >= sevenDaysAgo).length,
  };
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

function clampFee(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > max) return max;
  return Math.round(value * 100) / 100;
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
  // Cap razoável: 30% de percentual e R$ 50 de fixo. Admin não pode
  // aplicar taxas absurdas que prejudiquem sellers.
  const safe = {
    mdrPercent: clampFee(Number(fees.mdrPercent), 30),
    mdrFixed: clampFee(Number(fees.mdrFixed), 50),
    saquePercent: clampFee(Number(fees.saquePercent), 30),
    saqueFixed: clampFee(Number(fees.saqueFixed), 50),
  };
  const u = await prisma.user.update({
    where: { id },
    data: safe,
  });
  await audit("user.fees", "user", id, safe);
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

  const u = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
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
      await tx.userAcquirer.deleteMany({ where: { userId: id } });
      if (data.adquirenteIds.length) {
        await tx.userAcquirer.createMany({
          data: data.adquirenteIds.map((acquirerId) => ({
            userId: id,
            acquirerId,
            enabled: true,
          })),
        });
      }
    }
    return updated;
  });
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
  if (status === "aprovado") {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "ativo" },
    });
  } else if (status === "rejeitado") {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "pendente" },
    });
  }
  await audit("documents.bulk", "user", userId, { status });
  notifyDocReview(userId, status).catch(() => {});
  return { ok: true };
}

/** Documentos enviados pelo seller (compliance) */
export async function listUserDocuments(userId: string) {
  if (!(await dbAvailable())) return null;
  const docs = await prisma.document.findMany({
    where: { userId },
    orderBy: { submittedAt: "desc" },
  });
  return docs.map((d) => ({
    id: d.id,
    userId: d.userId,
    userName: d.userName,
    userEmail: d.userEmail,
    kind: d.kind,
    type: d.kind,
    typeLabel: d.typeLabel,
    submittedAt: d.submittedAt.toISOString(),
    status: d.status,
    previewUrl: d.previewUrl,
    notes: d.notes,
  }));
}
