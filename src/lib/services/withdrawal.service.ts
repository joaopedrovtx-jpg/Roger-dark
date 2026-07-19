import type { CreateWithdrawalInput, SaqueStatus, Withdrawal } from "@/lib/domain/types";
import {
  adjustBalance,
  getSellerBalance,
  getStore,
} from "@/lib/server/memory-store";
import { adminUsersMock } from "@/lib/mock/admin";
import {
  createWithdrawalViaPodPay,
  isPodPayEnabled,
  syncBalanceFromPodPay,
} from "@/lib/acquirers/podpay/gateway";
import {
  createWithdrawalViaVelana,
  syncBalanceFromVelana,
} from "@/lib/acquirers/velana/gateway";
import { resolveAcquirerForSeller } from "@/lib/acquirers/resolve";
import {
  isVelanaEnabled,
  isVelanaEnabledServer,
} from "@/lib/acquirers/velana/config";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

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
    if (!isDatabaseConfigured()) return { feePercent: 3, feeFixed: 0 };
    const u = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { saquePercent: true, saqueFixed: true, status: true },
    });
    if (!u) return { feePercent: 3, feeFixed: 0 };
    const { assertSellerCanTransact } = await import("@/lib/server/mock-check");
    assertSellerCanTransact(u.status);
    const feePercent = Number(u.saquePercent) > 0 ? Number(u.saquePercent) : 3;
    const feeFixed = Number(u.saqueFixed) || 0;
    return { feePercent, feeFixed };
  } catch (e) {
    if (e instanceof Error) throw e;
    return { feePercent: 3, feeFixed: 0 };
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
  if (input.amount < 5) throw new Error("Saque mínimo: R$ 5,00");
  if (!input.pixKey?.trim()) throw new Error("Chave PIX obrigatória");

  const fees = await loadSellerFees(sellerId);
  const feePercent = feePercentIn ?? fees.feePercent;
  const feeFixed = feeFixedIn ?? fees.feeFixed;
  const feeAmount = round2((input.amount * feePercent) / 100 + feeFixed);
  if (feeAmount >= input.amount) {
    throw new Error("Taxa de saque maior ou igual ao valor");
  }
  const netAmount = round2(input.amount - feeAmount);

  const active = await resolveAcquirerForSeller(sellerId);

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
    let provider: string | undefined;

    if (active?.provider === "podpay") {
      w = await createWithdrawalViaPodPay(sellerId, sellerName, input, {
        skipLocalDebit: debitedOnDb,
      });
      provider = "podpay";
    } else if (active?.provider === "velana") {
      w = await createWithdrawalViaVelana(sellerId, sellerName, input, {
        skipLocalDebit: debitedOnDb,
      });
      provider = "velana";
    } else if (await isVelanaEnabledServer()) {
      w = await createWithdrawalViaVelana(sellerId, sellerName, input, {
        skipLocalDebit: debitedOnDb,
      });
      provider = "velana";
    } else if (isPodPayEnabled()) {
      w = await createWithdrawalViaPodPay(sellerId, sellerName, input, {
        skipLocalDebit: debitedOnDb,
      });
      provider = "podpay";
    } else if (isVelanaEnabled()) {
      w = await createWithdrawalViaVelana(sellerId, sellerName, input, {
        skipLocalDebit: debitedOnDb,
      });
      provider = "velana";
    }

    if (w) {
      await persistWithdrawalDb(w, {
        feePercent,
        feeFixed,
        feeAmount: w.feeFixed || feeAmount,
        netAmount: round2(w.amount - (w.feeFixed || feeAmount)),
        provider,
        providerId: w.id,
      });
      return { ...w, feePercent, feeFixed };
    }
  } catch (e) {
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
      destination: input.pixKey.trim(),
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
    getStore().withdrawals.unshift(w);
    return w;
  }

  return createWithdrawalMock(sellerId, sellerName, input, feePercent, feeFixed, debitedOnDb);
}

function createWithdrawalMock(
  sellerId: string,
  sellerName: string,
  input: CreateWithdrawalInput,
  feePercent = 3,
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
  getStore().withdrawals.unshift(w);

  getStore().transactions.unshift({
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
  status: SaqueStatus
): Promise<Withdrawal> {
  if (status !== "pago" && status !== "recusado") {
    throw new Error("status inválido");
  }
  const { dbSetWithdrawalStatus } = await import("@/lib/server/db/admin-withdrawals.service");
  const fromDb = await dbSetWithdrawalStatus(id, status);
  if (fromDb) {
    try {
      const store = getStore();
      const local = store.withdrawals.find((x) => x.id === id);
      if (local) {
        local.status = status;
        if (status === "recusado") {
          adjustBalance(local.sellerId, { available: local.amount });
        }
      }
    } catch { /* ignore */ }
    return fromDb as Withdrawal;
  }
  return setWithdrawalStatus(id, status);
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

export { syncBalanceFromPodPay, syncBalanceFromVelana };
