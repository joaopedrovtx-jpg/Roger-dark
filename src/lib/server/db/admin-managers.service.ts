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
  } catch { /* ignore */ }
}

export async function listAdminManagers() {
  if (!(await dbAvailable())) return null;
  const items = await prisma.manager.findMany({ orderBy: { name: "asc" } });
  return items.map((g) => ({
    id: g.id,
    name: g.name,
    email: g.email,
    phone: g.phone,
    document: g.document,
    status: g.status,
    permissions: g.permissions as string[],
    sellersCount: g.sellersCount,
    volumeTotal: n(g.volumeTotal),
    userId: g.originUserId,
    createdAt: g.createdAt.toISOString(),
  }));
}

export async function dbUpdateManagerStatus(
  id: string,
  status: "ativo" | "inativo"
) {
  if (!(await dbAvailable())) return null;
  const g = await prisma.manager.update({
    where: { id },
    data: { status },
  });
  await audit("manager.status", "manager", id, { status });
  return { id: g.id, status: g.status };
}
