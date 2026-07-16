/**
 * Financeiro unificado — saques seller + admin.
 * Preferência: PodPay (se configurada) → senão mock local.
 */

import type {
  CreateWithdrawalInput,
  SaqueStatus,
  Withdrawal,
} from "@/lib/domain/types";
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

export async function createWithdrawal(
  sellerId: string,
  sellerName: string,
  input: CreateWithdrawalInput,
  feePercent = 3,
  feeFixed = 0
): Promise<Withdrawal> {
  if (input.amount < 5) throw new Error("Saque mínimo: R$ 5,00");
  if (!input.pixKey?.trim()) throw new Error("Chave PIX obrigatória");

  if (isPodPayEnabled()) {
    // Tenta sincronizar saldo remota antes (best-effort)
    try {
      await syncBalanceFromPodPay(sellerId);
    } catch {
      /* usa saldo local */
    }
    const bal = getSellerBalance(sellerId);
    if (input.amount > bal.available) {
      throw new Error("Saldo insuficiente");
    }
    return createWithdrawalViaPodPay(sellerId, sellerName, input);
  }

  return createWithdrawalMock(
    sellerId,
    sellerName,
    input,
    feePercent,
    feeFixed
  );
}

function createWithdrawalMock(
  sellerId: string,
  sellerName: string,
  input: CreateWithdrawalInput,
  feePercent = 3,
  feeFixed = 0
): Withdrawal {
  const bal = getSellerBalance(sellerId);
  if (input.amount > bal.available) {
    throw new Error("Saldo insuficiente");
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

  adjustBalance(sellerId, { available: -w.amount });
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

export function setWithdrawalStatus(
  id: string,
  status: SaqueStatus
): Withdrawal {
  const store = getStore();
  const w = store.withdrawals.find((x) => x.id === id);
  if (!w) throw new Error("Saque não encontrado");
  if (w.status !== "processando") {
    throw new Error("Só saques pendentes podem ser atualizados");
  }

  w.status = status;

  if (status === "recusado") {
    // devolve saldo
    adjustBalance(w.sellerId, { available: w.amount });
  }
  // pago: saldo já foi debitado na criação

  const tx = store.transactions.find((t) => t.id === id);
  if (tx) {
    tx.status = status === "pago" ? "pago" : status === "recusado" ? "recusado" : tx.status;
  }

  return w;
}

/** Preferência MySQL → memory-store */
export async function setWithdrawalStatusAsync(
  id: string,
  status: SaqueStatus
): Promise<Withdrawal> {
  if (status !== "pago" && status !== "recusado") {
    throw new Error("status inválido");
  }
  const { dbSetWithdrawalStatus } = await import("@/lib/server/db/admin.service");
  const fromDb = await dbSetWithdrawalStatus(id, status);
  if (fromDb) {
    // espelha no memory-store se existir
    try {
      const store = getStore();
      const local = store.withdrawals.find((x) => x.id === id);
      if (local) {
        local.status = status;
        if (status === "recusado") {
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

export function getFinanceSnapshot(sellerId: string) {
  const name =
    adminUsersMock.find((u) => u.id === sellerId)?.name ?? "Seller";
  return {
    balances: getSellerBalance(sellerId),
    withdrawals: listWithdrawals({ sellerId }),
    totalOut: listWithdrawals({ sellerId })
      .filter((w) => w.status === "pago")
      .reduce((a, w) => a + w.amount, 0),
    sellerName: name,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
