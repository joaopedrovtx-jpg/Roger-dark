/**
 * Store em memória (server + client via globalThis).
 * Em modo real começa vazio vendas/saques só entram via API / PodPay / DB.
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

export function getStore(): MemoryStore {
  if (!g.__darkpayMemoryStore) {
    g.__darkpayMemoryStore = createStore();
  }
  return g.__darkpayMemoryStore;
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
