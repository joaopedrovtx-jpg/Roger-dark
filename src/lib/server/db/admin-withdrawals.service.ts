import { randomBytes } from "crypto";
import { isDatabaseConfigured, prisma } from "@/lib/server/prisma";
import { notifyWithdrawalStatus } from "@/lib/server/notify-email";

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

/** Rótulo amigável da adquirente no histórico: Saque "Velana" */
function saqueDescription(provider?: string | null): string {
  const p = String(provider || "").toLowerCase().trim();
  const names: Record<string, string> = {
    velana: "Velana",
    podpay: "PodPay",
    woovi: "Woovi",
    openpix: "Woovi",
    manual: "Manual",
    darkpay: "DarkPay",
  };
  const name = names[p] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : "DarkPay");
  return `Saque "${name}"`;
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

export async function listAdminWithdrawals(status?: string, page = 1, pageSize = 50) {
  if (!(await dbAvailable())) return null;
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 200);
  const validStatuses = ["processando", "pago", "recusado"];
  const w = status && validStatuses.includes(status) ? { status } : {};

  const [items, total] = await Promise.all([
    prisma.withdrawal.findMany({
      where: w,
      orderBy: { date: "desc" },
      take: safePageSize,
      skip: (safePage - 1) * safePageSize,
    }),
    prisma.withdrawal.count({ where: w }),
  ]);
  return {
    items: items.map((s) => ({
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
    })),
    total,
  };
}

/**
 * Fluxo Woovi (docs oficiais):
 * 1) Seller solicita → POST /api/v1/payment → CREATED (aparece na Woovi)
 * 2) Admin aprova → POST /api/v1/payment/approve → envia PIX
 *
 * Se o saque ainda não foi criado na Woovi (pending_manual_*),
 * cria com autoApprove:true (criar + pagar numa chamada).
 */
async function dispatchPayoutToAcquirer(w: {
  id: string;
  sellerId: string;
  sellerName: string;
  amount: unknown;
  netAmount: unknown;
  destination: string;
  provider: string | null;
  providerId: string | null;
}): Promise<{ provider: string; providerId: string; remoteStatus: string }> {
  const current = String(w.provider || "").toLowerCase();
  const net = n(w.netAmount) > 0 ? n(w.netAmount) : n(w.amount);
  if (net <= 0) throw new Error("Valor líquido do saque inválido");

  /**
   * Fonte da verdade = adquirente da CONTA do seller agora.
   * - pending_manual* / fila local → SEMPRE resolve pela conta (Velana/PodPay/Woovi)
   * - se o saque já foi criado com remote real (provider=velana|podpay|woovi + id remoto),
     mantém essa (não recria em outra)
   *
   * Bug: saques antigos ficavam pending_manual_woovi e o Aprovar forçava Woovi
   * mesmo com a conta em Velana.
   */
  // Saque usa a adquirente white (payout primary), não a rota de cobrança
  const { resolveAcquirerForPayout } = await import(
    "@/lib/acquirers/resolve"
  );
  const route = await resolveAcquirerForPayout();
  const sellerProvider = route?.provider ?? null;

  const isPendingLocal =
    !current ||
    current.startsWith("pending") ||
    current === "internal" ||
    current === "darkpay" ||
    current === "manual" ||
    current.includes("pending_manual");

  const hasRealRemoteId =
    !!w.providerId &&
    !String(w.providerId).startsWith("SQ-") &&
    String(w.providerId) !== String(w.id) &&
    (current === "velana" || current === "podpay" || current === "woovi");

  let target: "woovi" | "velana" | "podpay" | null = null;
  if (isPendingLocal) {
    // Fila / não enviado: usa a adquirente ATIVA da conta
    target = sellerProvider;
  } else if (hasRealRemoteId) {
    if (current === "woovi") target = "woovi";
    else if (current === "podpay") target = "podpay";
    else if (current === "velana") target = "velana";
    else target = sellerProvider;
  } else {
    target = sellerProvider;
  }

  if (!target) {
    throw new Error(
      "Não há adquirente de saque configurada. Defina a white de PIX out em Admin → Adquirentes → Saque."
    );
  }

  const payoutInput = {
    amount: net,
    pixKey: w.destination,
  };

  // ── Woovi: approve se já existe CREATED; senão create+autoApprove ──
  if (target === "woovi") {
    const {
      createWithdrawalViaWoovi,
      approveWithdrawalViaWoovi,
    } = await import("@/lib/acquirers/woovi/gateway");

    const correlationFromRow =
      (w.providerId &&
      !String(w.providerId).startsWith("SQ-") &&
      current === "woovi"
        ? String(w.providerId)
        : null) ||
      // correlationID estável = wd_<id local>
      `wd_${String(w.id).replace(/[^a-zA-Z0-9_\-.]/g, "").slice(0, 80)}`;

    // Se já foi criado na Woovi (provider=woovi + correlation), só aprova
    if (current === "woovi" && w.providerId && !String(w.providerId).startsWith("SQ-")) {
      try {
        const approved = await approveWithdrawalViaWoovi(String(w.providerId));
        return {
          provider: "woovi",
          providerId: approved.correlationID,
          remoteStatus: approved.status,
        };
      } catch (e) {
        // Se approve falhar porque ainda não existe, tenta create+autoApprove
        const msg = e instanceof Error ? e.message : String(e);
        if (
          !/not found|não encontr|404|não existe|nao existe/i.test(msg) &&
          !/CREATED|already|já existe|ja existe/i.test(msg)
        ) {
          // tenta autoApprove path abaixo se for erro de "não criado"
        }
        // fallback create+approve
      }
    }

    // Cria e aprova numa chamada (docs: autoApprove)
    // Se já existe CREATED com mesmo correlationID, approve separado
    try {
      const remote = await createWithdrawalViaWoovi(
        w.sellerId,
        w.sellerName,
        payoutInput,
        {
          skipLocalDebit: true,
          correlationId: correlationFromRow,
          autoApprove: true,
        }
      );
      // Se voltou processando (CREATED sem auto), força approve
      if (remote.status === "processando") {
        const approved = await approveWithdrawalViaWoovi(remote.id);
        return {
          provider: "woovi",
          providerId: approved.correlationID,
          remoteStatus: approved.status,
        };
      }
      return {
        provider: "woovi",
        providerId: remote.id,
        remoteStatus: remote.status,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Idempotência: payment já existe → só aprova
      if (/já existe|ja existe|already exists|correlationID/i.test(msg)) {
        const approved = await approveWithdrawalViaWoovi(correlationFromRow);
        return {
          provider: "woovi",
          providerId: approved.correlationID,
          remoteStatus: approved.status,
        };
      }
      throw e;
    }
  }

  if (target === "velana") {
    const { createWithdrawalViaVelana } = await import(
      "@/lib/acquirers/velana/gateway"
    );
    const remote = await createWithdrawalViaVelana(
      w.sellerId,
      w.sellerName,
      payoutInput,
      { skipLocalDebit: true }
    );
    return {
      provider: "velana",
      providerId: remote.id,
      remoteStatus: remote.status,
    };
  }

  const { createWithdrawalViaPodPay } = await import(
    "@/lib/acquirers/podpay/gateway"
  );
  const remote = await createWithdrawalViaPodPay(
    w.sellerId,
    w.sellerName,
    payoutInput,
    { skipLocalDebit: true }
  );
  return {
    provider: "podpay",
    providerId: remote.id,
    remoteStatus: remote.status,
  };
}

/**
 * Admin "Aprovar e pagar":
 * - woovi CREATED → approve na API
 * - pending_manual* → create+approve na adquirente
 * - velana/podpay processando sem envio real → tenta criar
 *
 * Importante: aprovar NÃO marca "pago" pro seller se a adquirente
 * ainda estiver pendente. "pago" só via webhook (ou manual).
 */
function needsAcquirerDispatch(provider: string | null | undefined): boolean {
  const p = String(provider || "").toLowerCase();
  if (!p) return true;
  if (p.startsWith("pending_manual")) return true;
  if (p === "internal" || p === "darkpay" || p === "pending") return true;
  // woovi CREATED: admin precisa chamar approve
  if (p === "woovi" || p === "openpix") return true;
  if (p === "velana" || p === "podpay") return false; // já disparado no request
  return false;
}

/** Interpreta status remoto da adquirente (já mapeado ou raw). */
function mapRemotePayoutStatus(remote: string | undefined | null): "pago" | "recusado" | "processando" {
  const s = String(remote || "").toLowerCase();
  if (
    s === "pago" ||
    s === "paid" ||
    s === "confirmed" ||
    s === "completed" ||
    s === "done" ||
    s === "transferred" ||
    s === "success" || // Velana transfer real
    s === "ok" ||
    s === "approved"
  ) {
    return "pago";
  }
  if (
    s === "recusado" ||
    s === "failed" ||
    s === "rejected" ||
    s === "canceled" ||
    s === "cancelled" ||
    s === "removed" ||
    s === "refused"
  ) {
    return "recusado";
  }
  // APPROVED / CREATED / PENDING / processing → ainda pendente pro seller
  return "processando";
}

type WithdrawalRow = {
  id: string;
  sellerId: string;
  sellerName: string;
  amount: unknown;
  feeAmount: unknown;
  netAmount: unknown;
  feePercent: unknown;
  feeFixed: unknown;
  destination: string;
  method: string;
  date: Date;
  status: string;
  provider: string | null;
  providerId: string | null;
};

function toWithdrawalDto(
  row: WithdrawalRow,
  extra?: {
    payout?: {
      provider: string;
      providerId: string;
      remoteStatus: string;
    } | null;
    note?: string;
  }
) {
  return {
    id: row.id,
    sellerId: row.sellerId,
    sellerName: row.sellerName,
    date: row.date.toISOString(),
    amount: n(row.amount),
    method: row.method,
    destination: row.destination,
    status: row.status as "pago" | "recusado" | "processando",
    feePercent: n(row.feePercent),
    feeFixed: n(row.feeFixed),
    feeAmount: n(row.feeAmount),
    provider: row.provider,
    providerId: row.providerId,
    payout: extra?.payout ?? null,
    note: extra?.note,
  };
}

/**
 * Finaliza saque como PAGO (idempotente).
 * Usado por webhook da adquirente e por aprovação manual.
 */
export async function finalizeWithdrawalPaid(
  id: string,
  opts?: {
    provider?: string | null;
    providerId?: string | null;
    source?: string;
    skipNotify?: boolean;
  }
): Promise<{ applied: boolean; status: string; reason?: string }> {
  if (!(await dbAvailable())) {
    return { applied: false, status: "no_db", reason: "no_db" };
  }

  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w) return { applied: false, status: "missing", reason: "not_found" };
  if (w.status === "pago") {
    return { applied: false, status: "pago", reason: "already_paid" };
  }
  if (w.status !== "processando") {
    return { applied: false, status: w.status, reason: "status_ignored" };
  }

  const fee = n(w.feeAmount);
  const provider = opts?.provider || w.provider || "darkpay";
  const providerId = opts?.providerId || w.providerId || id;

  const updated = await prisma.$transaction(async (tx) => {
    const cas = await tx.withdrawal.updateMany({
      where: { id, status: "processando" },
      data: {
        status: "pago",
        reviewedAt: new Date(),
        failureReason: null,
        provider,
        providerId,
      },
    });
    if (cas.count === 0) return null;

    if (fee > 0) {
      await tx.user.update({
        where: { id: w.sellerId },
        data: { platformProfit: { increment: fee } },
      });
    }

    // Evita TX duplicada se admin já gravou algo no meio
    const existingTx = await tx.transaction.findFirst({
      where: {
        kind: "saque",
        OR: [
          { providerId },
          { id },
          { providerId: id },
        ],
        status: "pago",
      },
      select: { id: true },
    });
    if (!existingTx) {
      await tx.transaction.create({
        data: {
          id: newId("txs"),
          date: new Date(),
          sellerId: w.sellerId,
          sellerName: w.sellerName,
          kind: "saque",
          direction: "saida",
          description: saqueDescription(provider),
          method: "PIX",
          amount: n(w.amount),
          feeAmount: fee,
          netAmount: n(w.netAmount),
          platformFee: fee,
          status: "pago",
          provider,
          providerId,
        },
      });
    }

    return true;
  });

  if (!updated) {
    return { applied: false, status: "processando", reason: "race" };
  }

  await audit("withdrawal.pago", "withdrawal", id, {
    source: opts?.source || "webhook",
    provider,
    providerId,
  });
  if (!opts?.skipNotify) {
    notifyWithdrawalStatus(w.sellerId, n(w.amount), "pago", w.destination).catch(
      () => {}
    );
  }
  return { applied: true, status: "pago", reason: "withdrawal_paid" };
}

/**
 * Finaliza saque como RECUSADO + devolve saldo (idempotente).
 */
export async function finalizeWithdrawalFailed(
  id: string,
  opts?: {
    reason?: string;
    source?: string;
    skipNotify?: boolean;
  }
): Promise<{ applied: boolean; status: string; reason?: string }> {
  if (!(await dbAvailable())) {
    return { applied: false, status: "no_db", reason: "no_db" };
  }

  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w) return { applied: false, status: "missing", reason: "not_found" };
  if (w.status === "recusado") {
    return { applied: false, status: "recusado", reason: "already_rejected" };
  }
  if (w.status === "pago") {
    // Já liquidado — não reembolsa cego
    return { applied: false, status: "pago", reason: "status_ignored" };
  }
  if (w.status !== "processando") {
    return { applied: false, status: w.status, reason: "status_ignored" };
  }

  const fee = n(w.feeAmount);
  const failReason = (opts?.reason || "Falha na adquirente").slice(0, 500);

  const updated = await prisma.$transaction(async (tx) => {
    const cas = await tx.withdrawal.updateMany({
      where: { id, status: "processando" },
      data: {
        status: "recusado",
        reviewedAt: new Date(),
        failureReason: failReason,
      },
    });
    if (cas.count === 0) return null;

    await tx.user.update({
      where: { id: w.sellerId },
      data: { balanceAvailable: { increment: n(w.amount) } },
    });
    const user = await tx.user.findUnique({
      where: { id: w.sellerId },
      select: { balanceAvailable: true },
    });
    await tx.balanceLedger.create({
      data: {
        id: newId("led"),
        userId: w.sellerId,
        type: "withdrawal_refund",
        amount: n(w.amount),
        bucket: "available",
        balanceAfter: n(user?.balanceAvailable),
        referenceType: "withdrawal",
        referenceId: id,
        description: "Saque recusado valor devolvido",
      },
    });

    await tx.transaction.create({
      data: {
        id: newId("txs"),
        date: new Date(),
        sellerId: w.sellerId,
        sellerName: w.sellerName,
        kind: "saque",
        direction: "saida",
        description: "Saque recusado",
        method: "PIX",
        amount: n(w.amount),
        feeAmount: fee,
        netAmount: n(w.netAmount),
        platformFee: 0,
        status: "recusado",
        provider: w.provider || "darkpay",
        providerId: w.providerId || id,
      },
    });

    return true;
  });

  if (!updated) {
    return { applied: false, status: "processando", reason: "race" };
  }

  await audit("withdrawal.recusado", "withdrawal", id, {
    source: opts?.source || "webhook",
    reason: failReason,
  });
  if (!opts?.skipNotify) {
    notifyWithdrawalStatus(
      w.sellerId,
      n(w.amount),
      "recusado",
      w.destination
    ).catch(() => {});
  }
  return {
    applied: true,
    status: "recusado",
    reason: "withdrawal_failed_refunded",
  };
}

export async function dbSetWithdrawalStatus(
  id: string,
  status: "pago" | "recusado",
  opts?: { manual?: boolean; auto?: boolean }
) {
  if (!(await dbAvailable())) return null;
  const w = await prisma.withdrawal.findUnique({ where: { id } });
  if (!w) throw new Error("Saque não encontrado");
  if (w.status !== "processando") {
    throw new Error("Só saques pendentes podem ser atualizados");
  }

  // ── Recusar (admin) ────────────────────────────────────
  if (status === "recusado") {
    const r = await finalizeWithdrawalFailed(id, {
      reason: "Recusado pelo administrador",
      source: opts?.auto ? "auto" : "admin",
    });
    if (!r.applied && r.reason !== "already_rejected") {
      throw new Error(r.reason || "Falha ao recusar saque");
    }
    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    return toWithdrawalDto(row);
  }

  // ── Aprovar ────────────────────────────────────────────
  // manual = já pagou fora → marca pago direto
  if (opts?.manual) {
    const r = await finalizeWithdrawalPaid(id, {
      provider: "manual",
      providerId: id,
      source: "admin_manual",
    });
    if (!r.applied && r.reason !== "already_paid") {
      throw new Error(r.reason || "Falha ao marcar saque como pago");
    }
    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    return toWithdrawalDto(row, { note: "Marcado pago manualmente" });
  }

  let payoutMeta: {
    provider: string;
    providerId: string;
    remoteStatus: string;
  } | null = null;

  // Dispara PIX na adquirente quando ainda não foi enviado (Woovi CREATED / fila)
  if (needsAcquirerDispatch(w.provider)) {
    try {
      payoutMeta = await dispatchPayoutToAcquirer(w);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        await prisma.withdrawal.update({
          where: { id },
          data: { failureReason: msg.slice(0, 500) },
        });
      } catch {
        /* ignore */
      }
      throw new Error(
        `Não foi possível enviar o saque na adquirente: ${msg} ` +
          `O status permanece processando.`
      );
    }
  }

  const remoteFinal = mapRemotePayoutStatus(payoutMeta?.remoteStatus);

  // Atualiza provider/providerId + reviewedAt mesmo se ainda pendente na adquirente
  if (payoutMeta) {
    await prisma.withdrawal.update({
      where: { id },
      data: {
        provider: payoutMeta.provider,
        providerId: payoutMeta.providerId,
        reviewedAt: new Date(),
        failureReason: null,
      },
    });
  } else {
    // Velana/PodPay já enviados: só registra que admin liberou a fila
    await prisma.withdrawal.update({
      where: { id },
      data: {
        reviewedAt: new Date(),
        failureReason: null,
      },
    });
  }

  // Adquirente já liquidou na resposta → finaliza agora
  if (remoteFinal === "pago") {
    const r = await finalizeWithdrawalPaid(id, {
      provider: payoutMeta?.provider || w.provider,
      providerId: payoutMeta?.providerId || w.providerId,
      source: opts?.auto ? "saque_automatico" : "admin_approve",
    });
    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    return toWithdrawalDto(row, {
      payout: payoutMeta,
      note: r.applied
        ? "Pago confirmado pela adquirente"
        : "Já estava pago",
    });
  }

  if (remoteFinal === "recusado") {
    const r = await finalizeWithdrawalFailed(id, {
      reason: `Adquirente recusou (${payoutMeta?.remoteStatus || "failed"})`,
      source: opts?.auto ? "saque_automatico" : "admin_approve",
    });
    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    return toWithdrawalDto(row, {
      payout: payoutMeta,
      note: r.applied ? "Recusado pela adquirente" : "Status já terminal",
    });
  }

  // Adquirente ainda pendente → seller continua vendo "processando"
  await audit("withdrawal.approved_pending_acquirer", "withdrawal", id, {
    auto: !!opts?.auto,
    payout: payoutMeta,
  });

  const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id } });
  return toWithdrawalDto(row, {
    payout: payoutMeta,
    note:
      "Aprovado no painel. Aguardando confirmação da adquirente (webhook). " +
      "O seller continua vendo o saque como pendente.",
  });
}
