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

/** Cards da Dashboard Admin — agregações no SQL (não carrega todas as TXs). */
export async function getAdminDashboardMetrics(): Promise<AdminMetrics | null> {
  if (!(await dbAvailable())) return null;

  const [
    users,
    paidSales,
    decidedSales,
    totalSalesCount,
    paidWdFees,
    pendingWd,
    acquirersActive,
    pendingDocs,
    balAgg,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["status"], _count: true }),
    prisma.transaction.aggregate({
      where: { kind: "venda", status: "aprovada" },
      _sum: { amount: true, platformFee: true },
      _count: true,
    }),
    prisma.transaction.count({
      where: {
        kind: "venda",
        status: { in: ["aprovada", "recusada", "reembolsada"] },
      },
    }),
    prisma.transaction.count({ where: { kind: "venda" } }),
    prisma.withdrawal.aggregate({
      where: { status: "pago" },
      _sum: { feeAmount: true },
    }),
    prisma.withdrawal.aggregate({
      where: { status: "processando" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.acquirer.count({
      where: { status: "ativo", enabled: true },
    }),
    prisma.document.count({ where: { status: "pendente" } }),
    prisma.user.aggregate({
      _sum: {
        balanceHeld: true,
        balanceAvailable: true,
        balancePending: true,
        platformProfit: true,
      },
    }),
  ]);

  const countBy = (s: string) =>
    users.find((u) => u.status === s)?._count ?? 0;

  const totalUsers = users.reduce((a, u) => a + u._count, 0);
  const volumeProcessed = n(paidSales._sum.amount);
  const platformFromTx = n(paidSales._sum.platformFee);
  const platformFromWd = n(paidWdFees._sum.feeAmount);
  const paidCount = paidSales._count;
  const averageTicket = paidCount > 0 ? volumeProcessed / paidCount : 0;
  const conversionRate =
    decidedSales > 0 ? (paidCount / decidedSales) * 100 : 0;
  const platformRevenue = platformFromTx + platformFromWd;

  return {
    totalUsers,
    activeUsers: countBy("ativo"),
    pendingUsers: countBy("pendente"),
    blockedUsers: countBy("bloqueado"),
    pendingDocs,
    pendingSaques: pendingWd._count,
    pendingSaquesAmount: n(pendingWd._sum.amount),
    volumeProcessed,
    platformRevenue,
    platformRevenueSales: platformFromTx,
    platformRevenueWithdrawals: platformFromWd,
    activeAdquirentes: acquirersActive,
    totalTransactions: totalSalesCount,
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

  // Fallback: GROUP BY no SQL (SQLite/MySQL) — evita carregar milhares de rows
  try {
    const since = new Date(Date.now() - days * 864e5);
    // Prisma raw: date(date) funciona em SQLite; DATE(date) no MySQL
    const isMysql = (process.env.DATABASE_URL || "").startsWith("mysql");
    const rows = isMysql
      ? await prisma.$queryRaw<Array<{ d: Date | string; total: unknown }>>`
          SELECT DATE(\`date\`) AS d, SUM(amount) AS total
          FROM \`transactions\`
          WHERE kind = 'venda' AND status = 'aprovada' AND \`date\` >= ${since}
          GROUP BY DATE(\`date\`)
          ORDER BY d ASC
        `
      : await prisma.$queryRaw<Array<{ d: string; total: unknown }>>`
          SELECT date(date) AS d, SUM(amount) AS total
          FROM transactions
          WHERE kind = 'venda' AND status = 'aprovada' AND date >= ${since}
          GROUP BY date(date)
          ORDER BY d ASC
        `;

    return rows.map((r) => ({
      date:
        r.d instanceof Date
          ? r.d.toISOString().slice(0, 10)
          : String(r.d).slice(0, 10),
      amount: n(r.total),
      grain: "day" as const,
    }));
  } catch {
    // último recurso: sample limitado
    const txs = await prisma.transaction.findMany({
      where: {
        kind: "venda",
        status: "aprovada",
        date: { gte: new Date(Date.now() - days * 864e5) },
      },
      select: { date: true, amount: true },
      take: 2000,
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
      .map(([date, amount]) => ({ date, amount, grain: "day" as const }));
  }
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

/** Cards Saques admin — agregações SQL (não carrega todos os saques). */
export async function getAdminSaquesMetrics() {
  if (!(await dbAvailable())) return null;
  const [paid, pending, rejected] = await Promise.all([
    prisma.withdrawal.aggregate({
      where: { status: "pago" },
      _sum: { amount: true, feeAmount: true },
      _count: true,
    }),
    prisma.withdrawal.aggregate({
      where: { status: "processando" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.withdrawal.count({ where: { status: "recusado" } }),
  ]);
  return {
    totalOut: n(paid._sum.amount),
    pendingAmount: n(pending._sum.amount),
    lucroSobreSaque: n(paid._sum.feeAmount),
    paidCount: paid._count,
    pendingCount: pending._count,
    rejectedCount: rejected,
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
/** Garante PodPay + Velana no catálogo (credenciais / gerenciamento). */
async function ensureGatewayAcquirers() {
  // Velana = rota principal padrão (prioridade 1)
  const velana = await prisma.acquirer.findUnique({ where: { id: "velana" } });
  if (!velana) {
    await prisma.acquirer.create({
      data: {
        id: "velana",
        name: "Velana",
        code: "VELANA",
        status: "ativo",
        priority: 1,
        isPrimary: true,
        enabled: true,
        env: "live",
        // Custo plataforma → Velana: R$ 0,80 / TX
        feePercent: 0,
        feeFixed: 0.8,
        settlement: "D+0",
      },
    });
  }
  const podpay = await prisma.acquirer.findUnique({ where: { id: "podpay" } });
  if (!podpay) {
    await prisma.acquirer.create({
      data: {
        id: "podpay",
        name: "PodPay",
        code: "PODPAY",
        status: "ativo",
        priority: 2,
        isPrimary: false,
        enabled: true,
        env: "sandbox",
        feePercent: 1.49,
        feeFixed: 0.15,
        settlement: "D+0",
      },
    });
  }
}

export async function listAdminAcquirers() {
  if (!(await dbAvailable())) return null;
  try {
    await ensureGatewayAcquirers();
  } catch {
    /* ignore race / unique */
  }
  // Corrige estados antigos: #1 da fila = isPrimary (API de PIX)
  try {
    await syncAcquirerPrimaryFlags();
  } catch {
    /* ignore */
  }
  const items = await prisma.acquirer.findMany({
    orderBy: { priority: "asc" },
  });
  return items.map((a) => {
    const pub = (a.publicKey ?? "").trim();
    const priv = (a.privateKey ?? "").trim();
    return {
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
      // Nunca devolver secret completa na listagem
      publicKey: "",
      privateKey: "",
      hasPublicKey: !!pub,
      hasPrivateKey: !!priv,
      publicKeyHint: pub ? `…${pub.slice(-4)}` : null,
      privateKeyHint: priv ? `…${priv.slice(-4)}` : null,
      env: a.env,
      enabled: a.enabled,
      isPrimary: a.isPrimary,
    };
  });
}

/** Revele chaves completas (admin only) — uso sob demanda no painel. */
export async function getAcquirerSecrets(id: string) {
  if (!(await dbAvailable())) return null;
  const a = await findAcquirerByRef(id);
  if (!a) return null;
  return {
    id: a.id,
    publicKey: a.publicKey ?? "",
    privateKey: a.privateKey ?? "",
    env: a.env,
  };
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

/** Saque automático + rota de adquirentes (personalizado / plataforma) */
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

  // null limpa preferred; undefined mantém
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

/**
 * Garante que isPrimary bate com a ordem da fila:
 * priority menor = #1 = principal = isPrimary true (só um).
 * A API de PIX usa isso + priority para rotear.
 */
export async function syncAcquirerPrimaryFlags() {
  if (!(await dbAvailable())) return;
  const all = await prisma.acquirer.findMany({
    orderBy: [{ priority: "asc" }, { id: "asc" }],
  });
  if (!all.length) return;
  const primaryId = all[0].id;
  await prisma.$transaction([
    prisma.acquirer.updateMany({
      where: { id: { not: primaryId } },
      data: { isPrimary: false },
    }),
    prisma.acquirer.update({
      where: { id: primaryId },
      data: { isPrimary: true },
    }),
  ]);
}

/** Prioridade na rota ↑↓ — também promove isPrimary no #1 */
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
  // #1 da fila vira principal de verdade (API de cobrança)
  await syncAcquirerPrimaryFlags();
  await audit("acquirer.priority", "acquirer", id, { dir });
  return { ok: true };
}

/**
 * Define explicitamente uma adquirente como principal (#1 + isPrimary).
 * As demais sobem na fila (priority +1 se necessário).
 */
export async function dbSetAcquirerPrimary(id: string) {
  if (!(await dbAvailable())) return null;
  const target = await findAcquirerByRef(id);
  if (!target) throw new Error(`Adquirente "${id}" não encontrada`);

  const all = await prisma.acquirer.findMany({
    orderBy: [{ priority: "asc" }, { id: "asc" }],
  });
  // Reordena: target vira priority 1, demais 2,3,4…
  let p = 2;
  for (const row of all) {
    if (row.id === target.id) {
      await prisma.acquirer.update({
        where: { id: row.id },
        data: { priority: 1, isPrimary: true, enabled: true, status: "ativo" },
      });
    } else {
      await prisma.acquirer.update({
        where: { id: row.id },
        data: { priority: p, isPrimary: false },
      });
      p += 1;
    }
  }
  await audit("acquirer.set_primary", "acquirer", target.id, {});
  return { ok: true, id: target.id, priority: 1, isPrimary: true };
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
  data: {
    publicKey?: string;
    privateKey?: string;
    env?: string;
    /** Se true, promove a adquirente a primária (rota de PIX) */
    setPrimary?: boolean;
  }
) {
  if (!(await dbAvailable())) return null;

  // Garante PodPay/Velana no catálogo antes de salvar
  try {
    await ensureGatewayAcquirers();
  } catch {
    /* race */
  }

  let existing = await findAcquirerByRef(id);
  const isPodPay =
    id.toLowerCase() === "podpay" || id.toUpperCase() === "PODPAY";
  const isVelana =
    id.toLowerCase() === "velana" || id.toUpperCase() === "VELANA";

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
        publicKey: (data.publicKey ?? "").trim() || null,
        privateKey: (data.privateKey ?? "").trim() || null,
        feePercent: 1.49,
        feeFixed: 0.15,
        settlement: "D+0",
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
      hasPublicKey: !!existing.publicKey,
      env: existing.env,
      isPrimary: existing.isPrimary,
    };
  }

  // Seed mínimo se Velana ainda não existir
  // Custo: R$ 0,80 / TX (feeFixed). Seller paga taxa maior (2,99% + R$ 1,00 no gateway).
  if (!existing && isVelana) {
    existing = await prisma.acquirer.create({
      data: {
        id: "velana",
        name: "Velana",
        code: "VELANA",
        status: "ativo",
        priority: 2,
        isPrimary: !!data.setPrimary,
        enabled: true,
        env: data.env === "sandbox" ? "sandbox" : "live",
        publicKey: (data.publicKey ?? "").trim() || null,
        privateKey: (data.privateKey ?? "").trim() || null,
        feePercent: 0,
        feeFixed: 0.8,
        settlement: "D+0",
      },
    });
    if (data.setPrimary) {
      await prisma.acquirer.updateMany({
        where: { id: { not: "velana" } },
        data: { isPrimary: false },
      });
    }
    await audit("acquirer.credentials", "acquirer", existing.id, {
      created: true,
    });
    return {
      id: existing.id,
      publicKey: existing.publicKey ?? "",
      privateKey: existing.privateKey ? "••••" : "",
      hasPrivateKey: !!existing.privateKey,
      hasPublicKey: !!existing.publicKey,
      env: existing.env,
      isPrimary: existing.isPrimary,
    };
  }

  if (!existing) {
    throw new Error(
      `Adquirente "${id}" não encontrada. Cadastre em Adquirentes ou use o id correto.`
    );
  }

  // Campos vazios = manter valor atual (não apagar chave sem querer)
  const incomingPrivate = (data.privateKey ?? "").trim();
  const incomingPublic = (data.publicKey ?? "").trim();
  const privateKey =
    incomingPrivate && incomingPrivate !== "••••" && !incomingPrivate.startsWith("••")
      ? incomingPrivate
      : (existing.privateKey ?? "").trim();
  const publicKey =
    incomingPublic && incomingPublic !== "••••" && !incomingPublic.startsWith("••")
      ? incomingPublic
      : (existing.publicKey ?? "").trim();

  if (!privateKey && !publicKey) {
    throw new Error(
      isVelana
        ? "Informe a secret key da Velana (Configurações → Credenciais de API)."
        : "Informe ao menos a chave privada."
    );
  }

  // PodPay: se enviou chave nova, validar prefixo sk_
  if (
    (existing.code === "PODPAY" || existing.id === "podpay" || isPodPay) &&
    incomingPrivate &&
    !incomingPrivate.startsWith("sk_")
  ) {
    throw new Error(
      "Chave privada PodPay inválida. Use sk_test_… (sandbox) ou sk_live_… (produção)."
    );
  }

  // Velana: qualquer secret key (a API usa Basic Auth secretKey:x).
  // NÃO rejeitar sk_ — a Velana pode emitir chaves com esse prefixo.
  if (
    (existing.code === "VELANA" || existing.id === "velana" || isVelana) &&
    !privateKey
  ) {
    throw new Error(
      "Velana exige a secret key (chave secreta da API). A public key sozinha não autentica PIX."
    );
  }

  const env =
    data.env === "live" || data.env === "sandbox"
      ? data.env
      : privateKey.toLowerCase().includes("test") ||
          privateKey.toLowerCase().includes("sandbox")
        ? "sandbox"
        : existing.env || "live";

  if (data.setPrimary) {
    // Promove a #1 da rota (priority + isPrimary) — mesma regra do gerenciamento
    await prisma.acquirer.updateMany({
      where: { id: { not: existing.id } },
      data: { isPrimary: false },
    });
    // Quem era #1 sobe para priority 2 se esta não era #1
    if (existing.priority !== 1) {
      await prisma.acquirer.updateMany({
        where: { priority: 1, id: { not: existing.id } },
        data: { priority: existing.priority > 1 ? existing.priority : 2 },
      });
    }
  }

  const a = await prisma.acquirer.update({
    where: { id: existing.id },
    data: {
      publicKey: publicKey || null,
      privateKey: privateKey || null,
      env,
      enabled: true,
      status: "ativo",
      ...(data.setPrimary
        ? { isPrimary: true, priority: 1 }
        : {}),
    },
  });
  if (data.setPrimary) {
    await syncAcquirerPrimaryFlags();
  }
  await audit("acquirer.credentials", "acquirer", a.id, {
    hasPrivateKey: !!a.privateKey,
    setPrimary: !!data.setPrimary,
  });
  const refreshed = await prisma.acquirer.findUnique({ where: { id: a.id } });
  return {
    id: a.id,
    publicKey: a.publicKey ?? "",
    privateKey: a.privateKey ? "••••" : "",
    hasPrivateKey: !!a.privateKey,
    hasPublicKey: !!a.publicKey,
    env: a.env,
    isPrimary: refreshed?.isPrimary ?? a.isPrimary,
    priority: refreshed?.priority ?? a.priority,
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
