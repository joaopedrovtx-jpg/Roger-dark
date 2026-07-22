/**
 * Store em memória (server + client via globalThis).
 * Em modo real começa vazio vendas/saques só entram via API / PodPay / DB.
 *
 * DP-V3-12: memória cache de LEITURA apenas.
 *   - Saldo canônico = Prisma (User.balanceAvailable, ledger)
 *   - Cobranças/withdrawals = Prisma (Transaction, Withdrawal, PaymentCharge)
 *   - Este store só é consultado se DB não disponível (ALLOW_MOCK_DATA=1)
 *     ou como cache secundário durante a mesma request.
 *   - Nunca usado como fonte de verdade em produção.
 */

import type {
  PlatformBranding,
  Transaction,
  Withdrawal,
  Balances,
} from "@/lib/domain/types";
import { loadBranding } from "@/lib/branding";

export type PaymentStatus =
  | "waiting_payment"
  | "paid"
  | "expired"
  | "cancelled"
  | "refunded";

export interface PaymentCharge {
  id: string;
  sellerId: string;
  amount: number;
  currency: "BRL";
  status: PaymentStatus;
  method: "PIX";
  description?: string;
  customerName?: string;
  customerDocument?: string;
  metadata?: Record<string, string>;
  pixQrCode?: string;
  pixCopyPaste?: string;
  expiresAt: string;
  paidAt?: string;
  createdAt: string;
  transactionId?: string;
}

export interface MemoryStore {
  withdrawals: Withdrawal[];
  transactions: Transaction[];
  balances: Record<string, Balances>;
  charges: PaymentCharge[];
  branding: PlatformBranding | null;
}

function createStore(): MemoryStore {
  return {
    withdrawals: [],
    transactions: [],
    balances: {},
    charges: [],
    branding: null,
  };
}

const g = globalThis as unknown as { __darkpayMemoryStore?: MemoryStore };

/**
 * DP-V3-12: bloqueia escrita em produção sem override.
 * Em produção, qualquer mutação de estado deve ir para o Prisma.
 * Leituras (cache) continuam permitidas.
 */
let warned = false;
function guardWrite(field: keyof MemoryStore) {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.ALLOW_MEMORY_STORE_WRITES === "1") return;
  if (!warned) {
    warned = true;
    console.warn(
      `[memory-store] DP-V3-12: write to "${String(
        field
      )}" ignorado em produção (use Prisma).`
    );
  }
}

export function getStore(): MemoryStore {
  if (!g.__darkpayMemoryStore) {
    g.__darkpayMemoryStore = createStore();
  }
  return g.__darkpayMemoryStore;
}

/** Mutações que devem ser ignoradas em produção. */
export function memoryStoreWriteBlocked(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_MEMORY_STORE_WRITES !== "1"
  );
}

export function pushCharge(c: PaymentCharge) {
  if (memoryStoreWriteBlocked()) return;
  guardWrite("charges");
  getStore().charges.unshift(c);
}

export function pushWithdrawal(w: Withdrawal) {
  if (memoryStoreWriteBlocked()) return;
  guardWrite("withdrawals");
  getStore().withdrawals.unshift(w);
}

export function pushTransaction(t: Transaction) {
  if (memoryStoreWriteBlocked()) return;
  guardWrite("transactions");
  getStore().transactions.unshift(t);
}

export function setBrandingInStore(b: PlatformBranding) {
  if (memoryStoreWriteBlocked()) return;
  guardWrite("branding");
  getStore().branding = b;
}

export function resetStore() {
  g.__darkpayMemoryStore = createStore();
}

export function getSellerBalance(sellerId: string): Balances {
  const store = getStore();
  if (!store.balances[sellerId]) {
    store.balances[sellerId] = { available: 0, pending: 0, held: 0 };
  }
  return store.balances[sellerId];
}

export function adjustBalance(
  sellerId: string,
  delta: Partial<Balances>
) {
  if (memoryStoreWriteBlocked()) return;
  guardWrite("balances");
  const b = getSellerBalance(sellerId);
  if (delta.available !== undefined) b.available = round2(b.available + delta.available);
  if (delta.pending !== undefined) b.pending = round2(b.pending + delta.pending);
  if (delta.held !== undefined) b.held = round2(b.held + delta.held);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function getBrandingFromStore(): PlatformBranding {
  const store = getStore();
  if (store.branding) return store.branding;
  // client-only loadBranding when window exists
  if (typeof window !== "undefined") {
    store.branding = loadBranding();
    return store.branding;
  }
  return {
    logoUrl: "/logo-darkpay-header.png",
    faviconUrl: "/Fiveicon.png",
    authImageUrl: "/banner-darkpay.jpg",
    banners: [
      {
        id: "bn_default",
        imageUrl: "/banner-darkpay.jpg",
        name: "Banner principal",
        linkUrl: "",
      },
    ],
  };
}
