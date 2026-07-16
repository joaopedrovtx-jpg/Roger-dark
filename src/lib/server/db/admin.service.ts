/**
 * Admin metrics & lists — calcula os cards de todas as páginas admin
 * a partir do MySQL (Prisma). Fallback null se DB indisponível.
 *
 * Dashboard:
 *   volume processado, receita plataforma, total TXs, ticket médio,
 *   total usuários, saldo retido total, taxa conversão, gráfico, histórico
 * Usuários:
 *   total, ativos, pendentes, bloqueados, hoje, novos
 * Saques:
 *   total pago, esperando liberação, lucro sobre saque, contagens
 * Adquirentes:
 *   volume, TXs, ativos/manutenção/inativos, taxas pagas
 */

import type { AdminMetrics } from "@/lib/domain/types";
import { isDatabaseConfigured, prisma } from "@/lib/server/prisma";

export type AdminLedgerRow = {
  id: string;
  date: string;
  userName: string;
  kind: "venda" | "saque";
  direction: "entrada" | "saida";
  description: string;
  method: string;
  amount: number;
  status: string;
};

export type VolumePoint = {
  date: string;
  amount: number;
  grain?: "hour" | "day";
};

function n(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v) || 0;
}

export async function dbAvailable(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Cards da Dashboard Admin */
export async function getAdminDashboardMetrics(): Promise<AdminMetrics | null> {
  if (!(await dbAvailable())) return null;

  const [
    users,
    txs,
    withdrawals,
    acquirers,
    pendingDocs,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["status"], _count: true }),
    prisma.transaction.findMany({
      where: { kind: "venda" },
      select: { amount: true, status: true, platformFee: true },
    }),
    prisma.withdrawal.findMany({
      select: { amount: true, status: true, feeAmount: true },
    }),
    prisma.acquirer.findMany({
      select: { status: true, enabled: true },
    }),
    prisma.document.count({ where: { status: "pendente" } }),
  ]);

  const countBy = (s: string) =>
    users.find((u) => u.status === s)?._count ?? 0;

  const totalUsers = users.reduce((a, u) => a + u._count, 0);
  const paid = txs.filter((t) => t.status === "aprovada");
  const volumeProcessed = paid.reduce((a, t) => a + n(t.amount), 0);
  const platformFromTx = paid.reduce((a, t) => a + n(t.platformFee), 0);
  const platformFromWd = withdrawals
    .filter((w) => w.status === "pago")
    .reduce((a, w) => a + n(w.feeAmount), 0);
  const totalTransactions = txs.length;
  const averageTicket =
    paid.length > 0 ? volumeProcessed / paid.length : 0;

  const decided = txs.filter((t) =>
    ["aprovada", "recusada", "reembolsada"].includes(t.status)
  );
  const conversionRate =
    decided.length > 0
      ? (paid.length / decided.length) * 100
      : 0;

  const balAgg = await prisma.user.aggregate({
    _sum: {
      balanceHeld: true,
      balanceAvailable: true,
      balancePending: true,
      platformProfit: true,
    },
  });

  const pendingWd = withdrawals.filter((w) => w.status === "processando");
  const platformRevenue = platformFromTx + platformFromWd;

  return {
    totalUsers,
    activeUsers: countBy("ativo"),
    pendingUsers: countBy("pendente"),
    blockedUsers: countBy("bloqueado"),
    pendingDocs,
    pendingSaques: pendingWd.length,
    pendingSaquesAmount: pendingWd.reduce((a, w) => a + n(w.amount), 0),
    volumeProcessed,
    /** Lucro plataforma = taxas MDR das vendas pagas + taxas de saque pagos */
    platformRevenue,
    platformRevenueSales: platformFromTx,
    platformRevenueWithdrawals: platformFromWd,
    activeAdquirentes: acquirers.filter(
      (a) => a.status === "ativo" && a.enabled
    ).length,
    totalTransactions,
    averageTicket,
    totalHeldBalance: n(balAgg._sum.balanceHeld),
    totalAvailableBalance: n(balAgg._sum.balanceAvailable),
    totalPendingBalance: n(balAgg._sum.balancePending),
    conversionRate: Math.round(conversionRate * 10) / 10,
  };
}

/** Gráfico de volume (Dashboard Admin) */
export async function getAdminVolumeHistory(
  days = 10
): Promise<VolumePoint[] | null> {
  if (!(await dbAvailable())) return null;

  const rows = await prisma.metricDaily.findMany({
    where: { scope: "platform" },
    orderBy: { date: "desc" },
    take: days,
  });

  if (rows.length > 0) {
    return rows
      .map((r) => ({
        date:
          r.date instanceof Date
            ? r.date.toISOString().slice(0, 10)
            : String(r.date).slice(0, 10),
        amount: n(r.volumeGross),
        grain: "day" as const,
      }))
      .reverse();
  }

  // Fallback: agrega transactions aprovadas por dia
  const txs = await prisma.transaction.findMany({
    where: { kind: "venda", status: "aprovada" },
    select: { date: true, amount: true },
    orderBy: { date: "desc" },
    take: 5000,
  });

  const map = new Map<string, number>();
  for (const t of txs) {
    const d =
      t.date instanceof Date
        ? t.date.toISOString().slice(0, 10)
        : String(t.date).slice(0, 10);
    map.set(d, (map.get(d) ?? 0) + n(t.amount));
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-days)
    .map(([date, amount]) => ({ date, amount, grain: "day" as const }));
}

/** Histórico unificado vendas + saques (Dashboard Admin) */
export async function getAdminLedger(
  limit = 80
): Promise<AdminLedgerRow[] | null> {
  if (!(await dbAvailable())) return null;

  const [txs, wds] = await Promise.all([
    prisma.transaction.findMany({
      orderBy: { date: "desc" },
      take: limit,
    }),
    prisma.withdrawal.findMany({
      orderBy: { date: "desc" },
      take: limit,
    }),
  ]);

  const rows: AdminLedgerRow[] = [
    ...txs.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      userName: t.sellerName ?? t.sellerId,
      kind: "venda" as const,
      direction: (t.direction === "saida" ? "saida" : "entrada") as
        | "entrada"
        | "saida",
      description: t.description || t.product || "Venda",
      method: t.method,
      amount: n(t.amount),
      status: t.status,
    })),
    ...wds.map((w) => ({
      id: w.id,
      date: w.date.toISOString(),
      userName: w.sellerName,
      kind: "saque" as const,
      direction: "saida" as const,
      description: "Saque",
      method: w.method,
      amount: n(w.amount),
      status: w.status === "pago" ? "pago" : w.status === "recusado" ? "recusado" : "processando",
    })),
  ];

  return rows
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

/** Cards da página Usuários */
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

  // total sellers (exclui admin puro se roles for só admin — conta todos)
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
      fees: {
        mdrPercent: n(u.mdrPercent),
        mdrFixed: n(u.mdrFixed),
        saquePercent: n(u.saquePercent),
        saqueFixed: n(u.saqueFixed),
      },
    })),
  };
}

/** Cards Saques admin */
export async function getAdminSaquesMetrics() {
  if (!(await dbAvailable())) return null;
  const items = await prisma.withdrawal.findMany();
  const paid = items.filter((w) => w.status === "pago");
  const pending = items.filter((w) => w.status === "processando");
  const rejected = items.filter((w) => w.status === "recusado");
  return {
    totalOut: paid.reduce((a, w) => a + n(w.amount), 0),
    pendingAmount: pending.reduce((a, w) => a + n(w.amount), 0),
    lucroSobreSaque: paid.reduce((a, w) => a + n(w.feeAmount), 0),
    paidCount: paid.length,
    pendingCount: pending.length,
    rejectedCount: rejected.length,
  };
}

export async function listAdminWithdrawals(status?: string) {
  if (!(await dbAvailable())) return null;
  const where = status && status !== "todos" ? { status } : {};
  // map front tabs: processando = pendentes, pago, recusado
  const statusMap: Record<string, string> = {
    processando: "processando",
    pago: "pago",
    recusado: "recusado",
  };
  const w = status && statusMap[status] ? { status: statusMap[status] } : where;

  const items = await prisma.withdrawal.findMany({
    where: w,
    orderBy: { date: "desc" },
  });
  return items.map((s) => ({
    id: s.id,
    userId: s.sellerId,
    userName: s.sellerName,
    date: s.date.toISOString(),
    amount: n(s.amount),
    method: s.method,
    destination: s.destination,
    status: s.status,
    feePercent: n(s.feePercent),
    feeFixed: n(s.feeFixed),
    feeAmount: n(s.feeAmount),
  }));
}

/** Cards + lista Adquirentes */
export async function listAdminAcquirers() {
  if (!(await dbAvailable())) return null;
  const items = await prisma.acquirer.findMany({
    orderBy: { priority: "asc" },
  });
  return items.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    status: a.status,
    feePercent: n(a.feePercent),
    feeFixed: n(a.feeFixed),
    volumeMes: n(a.volumeMes),
    transactionsMes: a.transactionsMes,
    settlement: a.settlement,
    priority: a.priority,
    conversionRate: n(a.conversionRate),
    publicKey: a.publicKey ?? "",
    privateKey: a.privateKey ?? "",
    env: a.env,
    enabled: a.enabled,
    isPrimary: a.isPrimary,
  }));
}

export async function getAdminAcquirersMetrics() {
  const list = await listAdminAcquirers();
  if (!list) return null;
  const volume = list.reduce((a, x) => a + x.volumeMes, 0);
  const txs = list.reduce((a, x) => a + x.transactionsMes, 0);
  const taxasPagas = list.reduce(
    (a, x) =>
      a + x.volumeMes * (x.feePercent / 100) + x.transactionsMes * x.feeFixed,
    0
  );
  return {
    volume,
    txs,
    total: list.length,
    ativos: list.filter((x) => x.status === "ativo").length,
    manutencao: list.filter((x) => x.status === "manutencao").length,
    inativos: list.filter((x) => x.status === "inativo").length,
    taxasPagas,
    ticketMedio: txs > 0 ? volume / txs : 0,
  };
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

export async function getBrandingFromDb() {
  if (!(await dbAvailable())) return null;
  const b = await prisma.branding.findUnique({ where: { id: "default" } });
  if (!b) return null;
  const banners = await prisma.brandBanner.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
  return {
    logoUrl: b.logoUrl,
    faviconUrl: b.faviconUrl,
    authImageUrl: b.authImageUrl,
    banners: banners.map((x) => ({
      id: x.id,
      imageUrl: x.imageUrl,
      name: x.name,
      linkUrl: x.linkUrl,
    })),
  };
}

// ─── WRITES (admin actions) ─────────────────────────────

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
    /* ignore audit failures */
  }
}

/** Aprovar / recusar saque (Admin → Saques → Ver) — conectado ao seller */
export async function dbSetWithdrawalStatus(
  id: string,
  status: "pago" | "recusado"
) {
  if (!(await dbAvailable())) return null;
  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w) throw new Error("Saque não encontrado");
  if (w.status !== "processando") {
    throw new Error("Só saques pendentes podem ser atualizados");
  }

  const fee = n(w.feeAmount);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.withdrawal.update({
      where: { id },
      data: {
        status,
        reviewedAt: new Date(),
      },
    });

    if (status === "recusado") {
      // Devolve o valor integral ao disponível do seller
      await tx.user.update({
        where: { id: w.sellerId },
        data: {
          balanceAvailable: { increment: n(w.amount) },
        },
      });
      await tx.balanceLedger.create({
        data: {
          id: `led_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          userId: w.sellerId,
          type: "withdrawal_refund",
          amount: n(w.amount),
          bucket: "available",
          balanceAfter: 0,
          referenceType: "withdrawal",
          referenceId: id,
          description: "Saque recusado — valor devolvido",
        },
      });
    }

    if (status === "pago" && fee > 0) {
      // Lucro da plataforma sobre a taxa de saque
      await tx.user.update({
        where: { id: w.sellerId },
        data: {
          platformProfit: { increment: fee },
        },
      });
    }

    // Espelha no extrato de transações (ledger admin)
    await tx.transaction.create({
      data: {
        id: `TX-SQ-${Date.now().toString().slice(-8)}`,
        date: new Date(),
        sellerId: w.sellerId,
        sellerName: w.sellerName,
        kind: "saque",
        direction: "saida",
        description:
          status === "pago"
            ? `Saque PIX aprovado → ${w.destination}`
            : `Saque PIX recusado`,
        method: "PIX",
        amount: n(w.amount),
        feeAmount: fee,
        netAmount: n(w.netAmount),
        platformFee: status === "pago" ? fee : 0,
        status: status === "pago" ? "pago" : "recusado",
        provider: "darkpay",
        providerId: id,
      },
    }).catch(() => null);

    return row;
  });

  await audit(`withdrawal.${status}`, "withdrawal", id);
  return {
    id: updated.id,
    sellerId: updated.sellerId,
    sellerName: updated.sellerName,
    date: updated.date.toISOString(),
    amount: n(updated.amount),
    method: updated.method,
    destination: updated.destination,
    status: updated.status as "pago" | "recusado" | "processando",
    feePercent: n(updated.feePercent),
    feeFixed: n(updated.feeFixed),
    feeAmount: fee,
  };
}

/** Status do seller: ativo | pendente | bloqueado */
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

/** Taxas do seller (modal → aba Taxas → Salvar) */
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

/** Saque automático + rota de adquirentes */
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
  const u = await prisma.user.update({
    where: { id },
    data: {
      saqueAutomatico: data.saqueAutomatico,
      routingMode: data.routingMode,
      preferredAdquirenteId: data.preferredAdquirenteId ?? undefined,
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
  return { id: u.id };
}

/** Status adquirente: ativo | manutencao | inativo */
export async function dbUpdateAcquirerStatus(
  id: string,
  status: "ativo" | "manutencao" | "inativo"
) {
  if (!(await dbAvailable())) return null;
  const a = await prisma.acquirer.update({
    where: { id },
    data: {
      status,
      enabled: status === "ativo",
    },
  });
  await audit("acquirer.status", "acquirer", id, { status });
  return { id: a.id, status: a.status };
}

/** Prioridade na rota ↑↓ */
export async function dbSwapAcquirerPriority(id: string, dir: -1 | 1) {
  if (!(await dbAvailable())) return null;
  const all = await prisma.acquirer.findMany({ orderBy: { priority: "asc" } });
  const idx = all.findIndex((x) => x.id === id);
  const swap = idx + dir;
  if (idx < 0 || swap < 0 || swap >= all.length) return { ok: false };
  const a = all[idx];
  const b = all[swap];
  await prisma.$transaction([
    prisma.acquirer.update({
      where: { id: a.id },
      data: { priority: b.priority },
    }),
    prisma.acquirer.update({
      where: { id: b.id },
      data: { priority: a.priority },
    }),
  ]);
  await audit("acquirer.priority", "acquirer", id, { dir });
  return { ok: true };
}

/** Localiza adquirente por id ou code (ex.: podpay / PODPAY) */
async function findAcquirerByRef(id: string) {
  const ref = id.trim();
  if (!ref) return null;
  return prisma.acquirer.findFirst({
    where: {
      OR: [
        { id: ref },
        { code: ref },
        { code: ref.toUpperCase() },
        { code: ref.toLowerCase() },
      ],
    },
  });
}

/** Credenciais (chave pública/privada) — grava no DB (SQLite/MySQL) */
export async function dbSaveAcquirerCredentials(
  id: string,
  data: { publicKey: string; privateKey: string; env?: string }
) {
  if (!(await dbAvailable())) return null;

  let existing = await findAcquirerByRef(id);
  const isPodPay =
    id.toLowerCase() === "podpay" || id.toUpperCase() === "PODPAY";

  // Seed mínimo se PodPay ainda não existir
  if (!existing && isPodPay) {
    existing = await prisma.acquirer.create({
      data: {
        id: "podpay",
        name: "PodPay",
        code: "PODPAY",
        status: "ativo",
        priority: 1,
        isPrimary: true,
        enabled: true,
        env: data.env === "live" ? "live" : "sandbox",
        publicKey: data.publicKey || null,
        privateKey: data.privateKey || null,
      },
    });
    await audit("acquirer.credentials", "acquirer", existing.id, {
      created: true,
    });
    return {
      id: existing.id,
      publicKey: existing.publicKey ?? "",
      privateKey: existing.privateKey ? "••••" : "",
      hasPrivateKey: !!existing.privateKey,
    };
  }

  if (!existing) {
    throw new Error(
      `Adquirente "${id}" não encontrada. Cadastre em Adquirentes ou use o id correto.`
    );
  }

  const privateKey = (data.privateKey ?? "").trim();
  const publicKey = (data.publicKey ?? "").trim();
  const env =
    data.env === "live" || data.env === "sandbox"
      ? data.env
      : privateKey.includes("test")
        ? "sandbox"
        : existing.env || "sandbox";

  if (
    (existing.code === "PODPAY" || existing.id === "podpay" || isPodPay) &&
    privateKey &&
    !privateKey.startsWith("sk_")
  ) {
    throw new Error(
      "Chave privada PodPay inválida. Use sk_test_… (sandbox) ou sk_live_… (produção)."
    );
  }

  const a = await prisma.acquirer.update({
    where: { id: existing.id },
    data: {
      publicKey: publicKey || null,
      privateKey: privateKey || null,
      env,
      // Ao salvar chave, mantém habilitada
      ...(privateKey ? { enabled: true } : {}),
    },
  });
  await audit("acquirer.credentials", "acquirer", a.id);
  return {
    id: a.id,
    publicKey: a.publicKey ?? "",
    privateKey: a.privateKey ? "••••" : "",
    hasPrivateKey: !!a.privateKey,
  };
}

export async function dbClearAcquirerCredentials(id: string) {
  if (!(await dbAvailable())) return null;
  const existing = await findAcquirerByRef(id);
  if (!existing) {
    throw new Error(`Adquirente "${id}" não encontrada`);
  }
  await prisma.acquirer.update({
    where: { id: existing.id },
    data: { publicKey: null, privateKey: null },
  });
  await audit("acquirer.credentials.clear", "acquirer", existing.id);
  return { ok: true };
}

/** Status gerente */
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

/** Personalização — branding + banners */
export async function dbSaveBranding(input: {
  logoUrl: string;
  faviconUrl: string;
  authImageUrl: string;
  banners: Array<{
    id: string;
    imageUrl: string;
    name: string;
    linkUrl: string;
  }>;
}) {
  if (!(await dbAvailable())) return null;
  await prisma.branding.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      logoUrl: input.logoUrl,
      faviconUrl: input.faviconUrl,
      authImageUrl: input.authImageUrl,
    },
    update: {
      logoUrl: input.logoUrl,
      faviconUrl: input.faviconUrl,
      authImageUrl: input.authImageUrl,
    },
  });
  await prisma.brandBanner.deleteMany({});
  if (input.banners.length) {
    await prisma.brandBanner.createMany({
      data: input.banners.map((b, i) => ({
        id: b.id || newId("ban"),
        imageUrl: b.imageUrl,
        name: b.name ?? "",
        linkUrl: b.linkUrl ?? "",
        sortOrder: i,
        active: true,
      })),
    });
  }
  await audit("branding.save", "branding", "default");
  return getBrandingFromDb();
}

/** Aprovar / rejeitar todos docs do seller */
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
