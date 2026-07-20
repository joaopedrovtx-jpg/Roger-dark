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
  } catch {
    /* ignore */
  }
}

export async function listAdminManagers() {
  if (!(await dbAvailable())) return null;
  const items = await prisma.manager.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      sellers: {
        select: {
          id: true,
          volumeTotal: true,
        },
      },
    },
  });
  return items.map((g) => {
    const sellersCount = g.sellers.length;
    const volumeFromSellers = g.sellers.reduce(
      (a, s) => a + n(s.volumeTotal),
      0
    );
    return {
      id: g.id,
      name: g.name,
      email: g.email,
      phone: g.phone ?? "",
      document: g.document ?? "",
      status: g.status as "ativo" | "inativo",
      permissions: (Array.isArray(g.permissions)
        ? g.permissions
        : []) as string[],
      sellersCount,
      volumeTotal: volumeFromSellers > 0 ? volumeFromSellers : n(g.volumeTotal),
      userId: g.originUserId ?? undefined,
      createdAt: g.createdAt.toISOString(),
    };
  });
}

/** Promove seller existente a gerente (Manager + role manager no User). */
export async function dbCreateManagerFromUser(input: {
  userId: string;
  permissions: string[];
}) {
  if (!(await dbAvailable())) return null;

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new Error("Usuário não encontrado");
  if (user.status === "bloqueado") {
    throw new Error("Conta bloqueada não pode ser promovida a gerente");
  }

  const email = user.email.toLowerCase();
  const already = await prisma.manager.findUnique({ where: { email } });
  if (already) {
    throw new Error("Este e-mail já é gerente");
  }

  let roles: string[] = ["seller"];
  try {
    const raw = user.roles as unknown;
    const arr = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? JSON.parse(raw)
        : [];
    if (Array.isArray(arr) && arr.length) {
      roles = arr.map((r) => String(r).toLowerCase());
    }
  } catch {
    /* default */
  }
  if (!roles.includes("manager")) roles.push("manager");

  const perms =
    input.permissions?.length > 0
      ? input.permissions
      : ["dashboard", "usuarios", "documentos", "saques"];

  const id = newId("mgr");
  const manager = await prisma.manager.create({
    data: {
      id,
      name: user.name,
      email,
      phone: user.phone,
      document: user.document || user.cnpj || null,
      status: "ativo",
      permissions: perms,
      sellersCount: 0,
      volumeTotal: n(user.volumeTotal),
      originUserId: user.id,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      roles,
      status: user.status === "bloqueado" ? user.status : "ativo",
    },
  });

  await audit("manager.create", "manager", manager.id, {
    userId: user.id,
    email,
    permissions: perms,
  });

  return {
    id: manager.id,
    name: manager.name,
    email: manager.email,
    phone: manager.phone ?? "",
    document: manager.document ?? "",
    status: manager.status as "ativo" | "inativo",
    permissions: perms,
    sellersCount: 0,
    volumeTotal: n(manager.volumeTotal),
    userId: user.id,
    createdAt: manager.createdAt.toISOString(),
  };
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
