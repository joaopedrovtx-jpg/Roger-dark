import type { CreateWithdrawalInput, SaqueStatus, Withdrawal } from "@/lib/domain/types";
import {
  adjustBalance,
  getSellerBalance,
  getStore,
  pushTransaction,
  pushWithdrawal,
} from "@/lib/server/memory-store";
import { adminUsersMock } from "@/lib/mock/admin";
import {
  createWithdrawalViaPodPay,
  syncBalanceFromPodPay,
} from "@/lib/acquirers/podpay/gateway";
import {
  createWithdrawalViaVelana,
  syncBalanceFromVelana,
} from "@/lib/acquirers/velana/gateway";
import {
  createWithdrawalViaWoovi,
  syncBalanceFromWoovi,
} from "@/lib/acquirers/woovi/gateway";
import { isWooviPayoutDisabledError } from "@/lib/acquirers/woovi/client";
import { resolveAcquirerForPayout } from "@/lib/acquirers/resolve";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Velana (e algumas adquirentes) bloqueiam PIX out para chave de terceiro
 * (chave não vinculada ao CPF/CNPJ do recebedor da conta da empresa).
 * Nesse caso o Dark Pay ainda aceita o saque como pendente (admin libera).
 */
export function isThirdPartyPixRestriction(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: string }).code || "");
    if (code === "VELANA_PIX_SAME_DOCUMENT") return true;
  }
  const msg = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
  return (
    msg.includes("mesmo cpf") ||
    msg.includes("mesmo cnpj") ||
    msg.includes("cpf/cnpj do recebedor") ||
    (msg.includes("chave pix") && msg.includes("recebedor")) ||
    (msg.includes("transferências por chave") && msg.includes("recebedor")) ||
    (msg.includes("transferencias por chave") && msg.includes("recebedor"))
  );
}

async function createLocalPendingWithdrawal(opts: {
  sellerId: string;
  sellerName: string;
  amount: number;
  pixKey: string;
  feePercent: number;
  feeFixed: number;
  feeAmount: number;
  netAmount: number;
  provider?: string;
}): Promise<Withdrawal> {
  const { randomBytes } = await import("crypto");
  const id = `SQ-${randomBytes(6).toString("hex")}`;
  const w: Withdrawal = {
    id,
    sellerId: opts.sellerId,
    sellerName: opts.sellerName,
    date: new Date().toISOString(),
    amount: round2(opts.amount),
    method: "PIX",
    destination: opts.pixKey,
    status: "processando",
    feePercent: opts.feePercent,
    feeFixed: opts.feeFixed,
  };
  await persistWithdrawalDb(w, {
    feePercent: opts.feePercent,
    feeFixed: opts.feeFixed,
    feeAmount: opts.feeAmount,
    netAmount: opts.netAmount,
    provider: opts.provider ?? "pending_manual",
    providerId: id,
  });
  pushWithdrawal(w);
  return w;
}

// Helpers de chave PIX (destino livre — qualquer chave válida)
import {
  detectPixKeyKind,
  isValidPixKey,
  normalizePixKey,
  type PixKeyKind,
} from "@/lib/pix-key";

export {
  detectPixKeyKind,
  isValidPixKey,
  normalizePixKey,
  type PixKeyKind,
};

export function listWithdrawals(opts?: {
  sellerId?: string;
  status?: string;
}): Withdrawal[] {
  let items = [...getStore().withdrawals];
  if (opts?.sellerId) items = items.filter((w) => w.sellerId === opts.sellerId);
  if (opts?.status) items = items.filter((w) => w.status === opts.status);
  return items.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

async function loadSellerFees(sellerId: string): Promise<{
  feePercent: number;
  feeFixed: number;
}> {
  try {
    const { prisma, isDatabaseConfigured } = await import("@/lib/server/prisma");
    const {
      DEFAULT_SAQUE_FIXED,
      DEFAULT_SAQUE_PERCENT,
      parseSellerFeePlan,
    } = await import("@/lib/server/seller-fees");
    // Default real = 0 (sem taxa). Nunca forçar 3% se a conta não tem plano.
    if (!isDatabaseConfigured()) {
      return {
        feePercent: DEFAULT_SAQUE_PERCENT,
        feeFixed: DEFAULT_SAQUE_FIXED,
      };
    }
    const u = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { saquePercent: true, saqueFixed: true, status: true },
    });
    if (!u) {
      return {
        feePercent: DEFAULT_SAQUE_PERCENT,
        feeFixed: DEFAULT_SAQUE_FIXED,
      };
    }
    const { assertSellerCanTransact } = await import("@/lib/server/mock-check");
    assertSellerCanTransact(u.status);
    const plan = parseSellerFeePlan(u);
    return { feePercent: plan.saquePercent, feeFixed: plan.saqueFixed };
  } catch (e) {
    if (e instanceof Error) throw e;
    const { DEFAULT_SAQUE_FIXED, DEFAULT_SAQUE_PERCENT } = await import(
      "@/lib/server/seller-fees"
    );
    return {
      feePercent: DEFAULT_SAQUE_PERCENT,
      feeFixed: DEFAULT_SAQUE_FIXED,
    };
  }
}

async function persistWithdrawalDb(
  w: Withdrawal,
  opts: {
    feePercent: number;
    feeFixed: number;
    feeAmount: number;
    netAmount: number;
    provider?: string;
    providerId?: string;
  }
): Promise<void> {
  const { prisma, isDatabaseConfigured } = await import("@/lib/server/prisma");
  if (!isDatabaseConfigured()) return;

  const id = String(w.id).slice(0, 64);
  try {
    await prisma.withdrawal.upsert({
      where: { id },
      create: {
        id,
        sellerId: w.sellerId,
        sellerName: w.sellerName,
        amount: w.amount,
        feePercent: opts.feePercent,
        feeFixed: opts.feeFixed,
        feeAmount: opts.feeAmount,
        netAmount: opts.netAmount,
        method: "PIX",
        destination: w.destination,
        status: w.status,
        provider: opts.provider,
        providerId: opts.providerId ?? id,
      },
      update: {
        status: w.status,
        provider: opts.provider,
        providerId: opts.providerId ?? id,
      },
    });
  } catch (e) {
    const { log } = await import("@/lib/server/logger");
    log.error({ id, error: e instanceof Error ? e.message : String(e) }, "withdrawal_persist_failed");
    throw new Error("Saque processado na adquirente, mas falhou ao gravar no banco");
  }
}

export async function createWithdrawal(
  sellerId: string,
  sellerName: string,
  input: CreateWithdrawalInput,
  feePercentIn?: number,
  feeFixedIn?: number
): Promise<Withdrawal> {
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount)) {
    throw new Error("Valor inválido");
  }
  if (input.amount < 5) throw new Error("Saque mínimo: R$ 5,00");
  // Cap razoável: R$ 100.000,00 por saque. Configurável via env se precisar.
  const raw = process.env.WITHDRAWAL_MAX_AMOUNT;
  const WITHDRAWAL_MAX = raw != null && raw !== "" ? Number(raw) : 100000;
  if (input.amount > WITHDRAWAL_MAX) {
    throw new Error(`Saque máximo: R$ ${WITHDRAWAL_MAX.toFixed(2)}`);
  }
  // Qualquer chave PIX válida — não amarra ao documento/e-mail da conta.
  const pixKeyRaw = input.pixKey?.trim() ?? "";
  if (!pixKeyRaw) throw new Error("Chave PIX obrigatória");
  if (!isValidPixKey(pixKeyRaw)) {
    throw new Error(
      "Chave PIX inválida. Use e-mail, telefone (DDD+número), CPF, CNPJ ou chave aleatória (UUID)."
    );
  }
  const pixKey = normalizePixKey(pixKeyRaw);
  // Payload unificado com chave normalizada (destino livre)
  const payoutRequest: CreateWithdrawalInput = {
    amount: input.amount,
    pixKey,
  };

  // Bloqueia seller inativo/bloqueado aqui (não dependa de loadSellerFees).
  try {
    const { prisma, isDatabaseConfigured } = await import(
      "@/lib/server/prisma"
    );
    if (isDatabaseConfigured()) {
      const { assertSellerCanTransact } = await import("@/lib/server/mock-check");
      const u = await prisma.user.findUnique({
        where: { id: sellerId },
        select: { status: true },
      });
      if (!u) throw new Error("Conta não encontrada");
      assertSellerCanTransact(u.status);
    }
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Não foi possível validar a conta");
  }

  const fees = await loadSellerFees(sellerId);
  const feePercent = feePercentIn ?? fees.feePercent;
  const feeFixed = feeFixedIn ?? fees.feeFixed;
  const { computeWithdrawNetAmount } = await import("@/lib/server/seller-fees");
  const { fee: feeAmount, net: netAmount } = computeWithdrawNetAmount(
    input.amount,
    { saquePercent: feePercent, saqueFixed: feeFixed }
  );
  if (feeAmount >= input.amount) {
    throw new Error("Taxa de saque maior ou igual ao valor");
  }

  // Saque SEMPRE na adquirente white de PIX out (Admin → Adquirentes → Saque).
  // Independente da adquirente de cobrança do seller.
  const active = await resolveAcquirerForPayout(sellerId);

  const { debitAvailableBalance } = await import("@/lib/server/balance");
  const { isDatabaseConfigured } = await import("@/lib/server/prisma");

  let debitedOnDb = false;
  if (isDatabaseConfigured()) {
    const debit = await debitAvailableBalance(sellerId, input.amount);
    if (!debit.ok) {
      throw new Error(
        debit.reason === "insufficient_balance"
          ? "Saldo insuficiente"
          : "Não foi possível debitar o saldo"
      );
    }
    debitedOnDb = true;
    const bal = getSellerBalance(sellerId);
    getStore().balances[sellerId] = {
      ...bal,
      available: debit.newBalance,
    };
  } else {
    if (process.env.ALLOW_MOCK_DATA !== "1") {
      throw new Error("MySQL indisponível. Impossível solicitar saque real.");
    }
    const bal = getSellerBalance(sellerId);
    if (input.amount > bal.available) {
      throw new Error("Saldo insuficiente");
    }
  }

  try {
    let w: Withdrawal | null = null;
    let provider: "podpay" | "velana" | "woovi" | undefined;

    // Adquirente recebe o líquido (após taxa da plataforma).
    // Saldo do seller foi debitado pelo bruto (input.amount).
    const payoutInput: CreateWithdrawalInput = {
      amount: netAmount,
      pixKey,
    };

    /**
     * Saque SEMPRE na adquirente da conta do seller:
     * - personalizado + preferred → só essa (Velana / PodPay / Woovi)
     * - plataforma → #1 global da plataforma
     * NUNCA troca de adquirente no meio do caminho (saldo PIX fica na conta certa).
     */
    const only = active?.provider ?? null;
    if (!only) {
      throw new Error(
        "Nenhuma adquirente de saque configurada. Defina a white de PIX out em " +
          "Admin → Adquirentes → Saque (Velana, PodPay ou Woovi)."
      );
    }

    // Saque automático: mesmo efeito do botão Aprovar no painel admin
    let saqueAutomatico = false;
    try {
      const { prisma: p } = await import("@/lib/server/prisma");
      if (isDatabaseConfigured()) {
        const u = await p.user.findUnique({
          where: { id: sellerId },
          select: { saqueAutomatico: true },
        });
        saqueAutomatico = !!u?.saqueAutomatico;
      }
    } catch {
      saqueAutomatico = false;
    }

    if (only === "woovi") {
      // Seller solicita → CREATED na Woovi; admin Aprovar → envia PIX
      // Se saqueAutomatico: autoApprove (equivale à aprovação do painel)
      const { randomBytes } = await import("crypto");
      const localId = `SQ-${randomBytes(6).toString("hex")}`;
      const correlationId = `wd_${localId}`
        .replace(/[^a-zA-Z0-9_\-.]/g, "")
        .slice(0, 100);
      try {
        const remote = await createWithdrawalViaWoovi(
          sellerId,
          sellerName,
          payoutInput,
          {
            skipLocalDebit: debitedOnDb,
            correlationId,
            autoApprove: saqueAutomatico,
          }
        );
        w = {
          ...remote,
          id: localId,
          amount: round2(input.amount),
          feePercent,
          feeFixed,
          // Seller só vê "pago" quando webhook confirmar liquidação
          status: "processando",
          destination: pixKey,
        };
        provider = "woovi";
        await persistWithdrawalDb(w, {
          feePercent,
          feeFixed,
          feeAmount,
          netAmount,
          provider: "woovi",
          providerId: remote.id || correlationId,
        });
        pushWithdrawal(w);

        if (saqueAutomatico) {
          // autoApprove já disparou o PIX na create — não re-dispatch.
          // "pago" pro seller só se a API já liquidou; senão webhook.
          if (remote.status === "pago") {
            try {
              const { finalizeWithdrawalPaid } = await import(
                "@/lib/server/db/admin-withdrawals.service"
              );
              await finalizeWithdrawalPaid(localId, {
                provider: "woovi",
                providerId: remote.id || correlationId,
                source: "saque_automatico",
              });
              return { ...w, status: "pago" };
            } catch {
              /* fica processando */
            }
          } else {
            try {
              const { prisma: p2 } = await import("@/lib/server/prisma");
              await p2.withdrawal.update({
                where: { id: localId },
                data: { reviewedAt: new Date(), failureReason: null },
              });
            } catch {
              /* ignore */
            }
          }
        }
        return w;
      } catch (e) {
        // PIX out desligado → fila na MESMA adquirente (woovi), não muda pra Velana
        if (isWooviPayoutDisabledError(e)) throw e;
        throw e;
      }
    }

    if (only === "velana") {
      w = await createWithdrawalViaVelana(sellerId, sellerName, payoutInput, {
        skipLocalDebit: debitedOnDb,
      });
      provider = "velana";
    } else if (only === "podpay") {
      w = await createWithdrawalViaPodPay(sellerId, sellerName, payoutInput, {
        skipLocalDebit: debitedOnDb,
      });
      provider = "podpay";
    }

    if (w && provider) {
      const remoteAlreadyPaid = w.status === "pago";
      const remoteAlreadyRejected = w.status === "recusado";
      const recorded: Withdrawal = {
        ...w,
        amount: round2(input.amount),
        feePercent,
        feeFixed,
        // Seller vê processando até liquidação confirmada (API ou webhook)
        status:
          remoteAlreadyPaid || remoteAlreadyRejected
            ? w.status
            : "processando",
      };
      await persistWithdrawalDb(
        { ...recorded, status: "processando" },
        {
          feePercent,
          feeFixed,
          feeAmount,
          netAmount,
          provider,
          providerId: w.id,
        }
      );

      // API da adquirente já liquidou na resposta síncrona
      if (remoteAlreadyPaid) {
        try {
          const { finalizeWithdrawalPaid } = await import(
            "@/lib/server/db/admin-withdrawals.service"
          );
          await finalizeWithdrawalPaid(recorded.id, {
            provider,
            providerId: w.id,
            source: saqueAutomatico ? "saque_automatico" : "acquirer_sync",
          });
          return { ...recorded, status: "pago" };
        } catch {
          /* webhook finaliza depois */
        }
      }
      if (remoteAlreadyRejected) {
        try {
          const { finalizeWithdrawalFailed } = await import(
            "@/lib/server/db/admin-withdrawals.service"
          );
          await finalizeWithdrawalFailed(recorded.id, {
            reason: "Adquirente recusou na criação",
            source: "acquirer_sync",
          });
          return { ...recorded, status: "recusado" };
        } catch {
          /* ignore */
        }
      }

      // Velana/PodPay: PIX já foi enviado; saque automático só marca reviewed
      // (status pro seller permanece processando até webhook)
      if (saqueAutomatico) {
        const settled = await maybeAutoApproveWithdrawal(sellerId, recorded.id);
        return settled ?? { ...recorded, status: "processando" };
      }
      return { ...recorded, status: "processando" };
    }

    throw new Error(
      `Adquirente "${only}" não conseguiu processar o saque. Tente novamente.`
    );
  } catch (e) {
    // Velana: chave de terceiro → pendente manual.
    // Woovi sem PIX out e sem fallback → também fila para admin.
    // Saldo já debitado — NÃO estorna nesses casos.
    if (
      (isThirdPartyPixRestriction(e) || isWooviPayoutDisabledError(e)) &&
      debitedOnDb &&
      isDatabaseConfigured()
    ) {
      try {
        const { log } = await import("@/lib/server/logger");
        log.warn(
          {
            sellerId,
            pixKey,
            amount: input.amount,
            message: e instanceof Error ? e.message : String(e),
          },
          isWooviPayoutDisabledError(e)
            ? "withdrawal_queued_woovi_payout_disabled"
            : "withdrawal_queued_third_party_pix"
        );
      } catch {
        /* ignore */
      }
      const pending = await createLocalPendingWithdrawal({
        sellerId,
        sellerName,
        amount: input.amount,
        pixKey,
        feePercent,
        feeFixed,
        feeAmount,
        netAmount,
        provider: isWooviPayoutDisabledError(e)
          ? "pending_manual_woovi"
          : "pending_manual",
      });
      // Fila manual: se saque automático, tenta aprovar (create+approve na adquirente)
      const settled = await maybeAutoApproveWithdrawal(sellerId, pending.id);
      return settled ?? pending;
    }

    if (debitedOnDb && isDatabaseConfigured()) {
      const { prisma } = await import("@/lib/server/prisma");
      await prisma.user.update({
        where: { id: sellerId },
        data: { balanceAvailable: { increment: input.amount } },
      });
      adjustBalance(sellerId, { available: input.amount });
    }
    throw e;
  }

  if (process.env.ALLOW_MOCK_DATA !== "1") {
    if (debitedOnDb && isDatabaseConfigured()) {
      const { prisma } = await import("@/lib/server/prisma");
      await prisma.user.update({
        where: { id: sellerId },
        data: { balanceAvailable: { increment: input.amount } },
      });
      adjustBalance(sellerId, { available: input.amount });
    }
    throw new Error(
      "Adquirente não configurada. Configure Velana/PodPay em Admin → Credenciais."
    );
  }

  if (isDatabaseConfigured()) {
    const { randomBytes } = await import("crypto");
    const id = `SQ-${randomBytes(6).toString("hex")}`;
    const w: Withdrawal = {
      id,
      sellerId,
      sellerName,
      date: new Date().toISOString(),
      amount: round2(input.amount),
      method: "PIX",
      destination: pixKey,
      status: "processando",
      feePercent,
      feeFixed,
    };
    await persistWithdrawalDb(w, {
      feePercent,
      feeFixed,
      feeAmount,
      netAmount,
      provider: "internal",
      providerId: id,
    });
    pushWithdrawal(w);
    return w;
  }

  return createWithdrawalMock(
    sellerId,
    sellerName,
    payoutRequest,
    feePercent,
    feeFixed,
    debitedOnDb
  );
}

function createWithdrawalMock(
  sellerId: string,
  sellerName: string,
  input: CreateWithdrawalInput,
  feePercent = 0,
  feeFixed = 0,
  alreadyDebited = false
): Withdrawal {
  if (!alreadyDebited) {
    const bal = getSellerBalance(sellerId);
    if (input.amount > bal.available) {
      throw new Error("Saldo insuficiente");
    }
  }

  const w: Withdrawal = {
    id: `SQ-${Date.now().toString().slice(-8)}`,
    sellerId,
    sellerName,
    date: new Date().toISOString(),
    amount: round2(input.amount),
    method: "PIX",
    destination: input.pixKey.trim(),
    status: "processando",
    feePercent,
    feeFixed,
  };

  if (!alreadyDebited) {
    adjustBalance(sellerId, { available: -w.amount });
  }
  pushWithdrawal(w);

  pushTransaction({
    id: w.id,
    date: w.date,
    sellerId,
    sellerName,
    kind: "saque",
    direction: "saida",
    description: "Saque",
    method: "PIX",
    amount: w.amount,
    status: "processando",
  });

  return w;
}

export function setWithdrawalStatus(id: string, status: SaqueStatus): Withdrawal {
  const store = getStore();
  const w = store.withdrawals.find((x) => x.id === id);
  if (!w) throw new Error("Saque não encontrado");
  if (w.status !== "processando") {
    throw new Error("Só saques pendentes podem ser atualizados");
  }

  w.status = status;

  if (status === "recusado") {
    adjustBalance(w.sellerId, { available: w.amount });
  }

  const tx = store.transactions.find((t) => t.id === id);
  if (tx) {
    tx.status = status === "pago" ? "pago" : status === "recusado" ? "recusado" : tx.status;
  }

  return w;
}

export async function setWithdrawalStatusAsync(
  id: string,
  status: SaqueStatus,
  opts?: { manual?: boolean; auto?: boolean }
): Promise<Withdrawal> {
  if (status !== "pago" && status !== "recusado") {
    throw new Error("status inválido");
  }
  const { dbSetWithdrawalStatus } = await import(
    "@/lib/server/db/admin-withdrawals.service"
  );
  const fromDb = await dbSetWithdrawalStatus(id, status, opts);
  if (fromDb) {
    try {
      const store = getStore();
      const local = store.withdrawals.find((x) => x.id === id);
      if (local) {
        // Status real pode continuar processando se adquirente pendente
        local.status = fromDb.status;
        if (fromDb.status === "recusado") {
          adjustBalance(local.sellerId, { available: local.amount });
        }
      }
    } catch {
      /* ignore */
    }
    return fromDb as Withdrawal;
  }
  return setWithdrawalStatus(id, status);
}

/**
 * Se o seller tem saqueAutomatico ativo, dispara a mesma aprovação
 * do painel admin (envia PIX na adquirente). O status "pago" ainda
 * só chega via webhook se a adquirente continuar pendente.
 */
async function maybeAutoApproveWithdrawal(
  sellerId: string,
  withdrawalId: string
): Promise<Withdrawal | null> {
  try {
    const { prisma, isDatabaseConfigured } = await import(
      "@/lib/server/prisma"
    );
    if (!isDatabaseConfigured()) return null;
    const u = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { saqueAutomatico: true },
    });
    if (!u?.saqueAutomatico) return null;

    const { log } = await import("@/lib/server/logger");
    log.info(
      { sellerId, withdrawalId },
      "withdrawal_auto_approve_start"
    );

    const result = await setWithdrawalStatusAsync(withdrawalId, "pago", {
      auto: true,
    });
    log.info(
      {
        sellerId,
        withdrawalId,
        status: result.status,
      },
      "withdrawal_auto_approve_done"
    );
    return result;
  } catch (e) {
    try {
      const { log } = await import("@/lib/server/logger");
      log.warn(
        {
          sellerId,
          withdrawalId,
          error: e instanceof Error ? e.message : String(e),
        },
        "withdrawal_auto_approve_failed"
      );
    } catch {
      /* ignore */
    }
    // Saque fica processando — admin ainda pode aprovar manualmente
    return null;
  }
}

export function getFinanceSnapshot(sellerId: string) {
  const name = adminUsersMock.find((u) => u.id === sellerId)?.name ?? "Seller";
  return {
    balances: getSellerBalance(sellerId),
    withdrawals: listWithdrawals({ sellerId }),
    totalOut: listWithdrawals({ sellerId })
      .filter((w) => w.status === "pago")
      .reduce((a, w) => a + w.amount, 0),
    sellerName: name,
  };
}

export async function getFinanceSnapshotPreferDb(sellerId: string) {
  const { getSellerFinance } = await import("@/lib/server/db/seller-finance.service");
  const fromDb = await getSellerFinance(sellerId);
  if (fromDb) return { source: "mysql" as const, ...fromDb };
  if (process.env.ALLOW_MOCK_DATA === "1") {
    return { source: "mock" as const, ...getFinanceSnapshot(sellerId) };
  }
  return null;
}

export { syncBalanceFromPodPay, syncBalanceFromVelana, syncBalanceFromWoovi };
