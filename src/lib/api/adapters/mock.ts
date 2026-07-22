/**
 * Adapter mock unificado memory-store + mocks.
 * Seller e admin compartilham saques, cobranças e saldos.
 */

import type { DarkPayApi } from "../client";
import type {
  AuthUser,
  LoginInput,
  PeriodKey,
  PlatformBranding,
  RegisterInput,
  Session,
  SellerProfile,
  Withdrawal,
} from "@/lib/domain/types";
import { getDashboardForPeriod } from "@/lib/mock/byPeriod";
import {
  adminMetricsMock,
  adminUsersMock,
  DEFAULT_SELLER_FEES,
} from "@/lib/mock/admin";
import { loadBranding, saveBranding } from "@/lib/branding";
import {
  getSellerBalance,
  getStore,
} from "@/lib/server/memory-store";
import {
  createWithdrawal,
  getFinanceSnapshot,
  listWithdrawals,
  setWithdrawalStatus,
} from "@/lib/services/finance.service";
import {
  createPixCharge,
  getCharge,
  listCharges,
  markChargePaid,
  cancelCharge,
} from "@/lib/services/payment.service";

const SESSION_KEY = "darkpay.session.v1";

function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function toAuthUser(partial: {
  id: string;
  name: string;
  email: string;
  status?: AuthUser["status"];
  roles?: AuthUser["roles"];
}): AuthUser {
  return {
    id: partial.id,
    name: partial.name,
    email: partial.email,
    status: partial.status ?? "ativo",
    roles: partial.roles ?? ["seller"],
    avatarUrl: null,
  };
}

function sellerFromAdmin(id: string): SellerProfile | null {
  const u = adminUsersMock.find((x) => x.id === id);
  if (!u) return null;
  const bal = getSellerBalance(u.id);
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    document: u.document,
    phone: u.phone,
    status: u.status,
    personType: u.personType,
    displayName: u.displayName,
    company: u.company,
    cnpj: u.cnpj,
    address: u.address,
    city: u.city,
    state: u.state,
    zip: u.zip,
    avatarUrl: null,
    createdAt: u.createdAt,
    balances: { ...bal },
    volumeTotal: u.volumeTotal,
    platformProfit: u.platformProfit,
    fees: u.fees ?? { ...DEFAULT_SELLER_FEES },
    saqueAutomatico: !!u.saqueAutomatico,
    routingMode: u.routingMode ?? "plataforma",
    preferredAdquirenteId: u.preferredAdquirenteId ?? null,
    adquirenteIds: u.adquirenteIds ?? [],
  };
}

function currentSellerId(): string {
  return loadSession()?.user.id ?? "usr_01";
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const mockAdapter: DarkPayApi = {
  async login(input: LoginInput): Promise<Session> {
    await delay(300);
    const email = input.email.trim().toLowerCase();
    if (email.includes("admin")) {
      const session: Session = {
        user: toAuthUser({
          id: "usr_admin",
          name: "Admin DarkPay",
          email,
          roles: ["admin", "seller"],
          status: "ativo",
        }),
        token: `mock_admin_${Date.now()}`,
        expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
      };
      saveSession(session);
      return session;
    }
    const match =
      adminUsersMock.find((u) => u.email.toLowerCase() === email) ??
      adminUsersMock[0];
    const session: Session = {
      user: toAuthUser({
        id: match.id,
        name: match.name,
        email: match.email,
        roles: ["seller"],
        status: match.status,
      }),
      token: `mock_${Date.now()}`,
      expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
    };
    saveSession(session);
    return session;
  },

  async register(input: RegisterInput): Promise<Session> {
    await delay(400);
    const id = `usr_${Date.now()}`;
    getSellerBalance(id); // init zero
    const session: Session = {
      user: toAuthUser({
        id,
        name: input.name,
        email: input.email,
        roles: ["seller"],
        status: "pendente",
      }),
      token: `mock_${Date.now()}`,
      expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
    };
    saveSession(session);
    return session;
  },

  async logout(): Promise<void> {
    saveSession(null);
  },

  async me(): Promise<AuthUser | null> {
    return loadSession()?.user ?? null;
  },

  async forgotPassword(email: string) {
    await delay(300);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("darkpay.auth.resetEmail", email);
    }
    return { ok: true };
  },

  async resetPassword() {
    await delay(300);
    return { ok: true };
  },

  async getDashboard(period: PeriodKey) {
    await delay(100);
    const data = getDashboardForPeriod(period);
    const session = loadSession();
    const sellerId = session?.user.id ?? "usr_01";
    const bal = getSellerBalance(sellerId);
    const conv = data.conversion;
    const conversionRate =
      typeof conv === "object" && conv
        ? (conv.pix + conv.boleto + conv.card) / 3
        : 0;
    return {
      user: {
        id: sellerId,
        name: session?.user.name ?? data.user.name,
        avatarUrl: data.user.avatarUrl,
      },
      balances: { ...bal },
      metrics: {
        netProfit: data.metrics.netProfit,
        transactionCount: data.metrics.totalTransactions,
        averageTicket: data.metrics.averageTicket,
        totalOut: data.metrics.totalOutflows ?? 0,
      },
      conversionRate,
      revenueHistory: data.revenueHistory,
      volumeGoal: {
        current: data.volume.current,
        target: data.volume.goal,
      },
    };
  },

  async getTransactions(params) {
    await delay(100);
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 40;
    const sellerId = currentSellerId();
    let items = getStore().transactions.filter(
      (t) => t.sellerId === sellerId || sellerId === "usr_01"
    );
    // prefer seller's own; include usr_01 seed for demo
    if (sellerId !== "usr_01") {
      items = getStore().transactions.filter((t) => t.sellerId === sellerId);
    }
    if (params?.status) {
      items = items.filter((i) => i.status === params.status);
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      items = items.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          (i.customer ?? "").toLowerCase().includes(q)
      );
    }
    items = [...items].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const total = items.length;
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total,
      page,
      pageSize,
    };
  },

  async getFinance() {
    await delay(100);
    const sellerId = currentSellerId();
    const snap = getFinanceSnapshot(sellerId);
    return {
      balances: snap.balances,
      withdrawals: snap.withdrawals,
      totalOut: snap.totalOut,
    };
  },

  async createWithdrawal(input) {
    await delay(300);
    const session = loadSession();
    const sellerId = session?.user.id ?? "usr_01";
    const name = session?.user.name ?? "Seller";
    return await createWithdrawal(sellerId, name, input);
  },

  async getProfile() {
    await delay(80);
    const id = currentSellerId();
    return sellerFromAdmin(id) ?? sellerFromAdmin("usr_01")!;
  },

  async getBranding(): Promise<PlatformBranding> {
    if (typeof window !== "undefined") return loadBranding();
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
  },

  async updateBranding(branding) {
    saveBranding(branding);
    getStore().branding = branding;
    return branding;
  },

  async getAdminMetrics() {
    await delay(80);
    const store = getStore();
    const pendingSaques = store.withdrawals.filter(
      (w) => w.status === "processando"
    );
    return {
      ...adminMetricsMock,
      pendingSaques: pendingSaques.length,
      pendingSaquesAmount: pendingSaques.reduce((a, w) => a + w.amount, 0),
      totalHeldBalance: Object.values(store.balances).reduce(
        (a, b) => a + b.held,
        0
      ),
    };
  },

  async listSellers(params) {
    await delay(100);
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 50;
    let items = adminUsersMock
      .map((u) => sellerFromAdmin(u.id)!)
      .filter(Boolean);
    if (params?.status) {
      items = items.filter((i) => i.status === params.status);
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.email.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q)
      );
    }
    const total = items.length;
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total,
      page,
      pageSize,
    };
  },

  async listWithdrawalsAdmin(params) {
    await delay(100);
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 50;
    let items = listWithdrawals({
      status: params?.status as Withdrawal["status"] | undefined,
    });
    if (params?.search) {
      const q = params.search.toLowerCase();
      items = items.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          i.sellerName.toLowerCase().includes(q)
      );
    }
    const total = items.length;
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total,
      page,
      pageSize,
    };
  },

  async setWithdrawalStatus(id, status) {
    await delay(250);
    const { setWithdrawalStatusAsync } = await import(
      "@/lib/services/finance.service"
    );
    return setWithdrawalStatusAsync(id, status);
  },

  async createPayment(input) {
    await delay(200);
    const sellerId = currentSellerId();
    return await createPixCharge({
      sellerId,
      amount: input.amount,
      description: input.description,
      customerName: input.customerName,
      customerDocument: input.customerDocument,
      metadata: input.metadata,
    });
  },

  async getPayment(id) {
    await delay(80);
    return getCharge(id);
  },

  async listPayments() {
    await delay(80);
    return listCharges(currentSellerId());
  },

  async simulatePaymentPaid(id) {
    await delay(300);
    return await markChargePaid(id);
  },
};

export const paymentMock = {
  createCharge: createPixCharge,
  getCharge,
  listCharges,
  markPaid: markChargePaid,
  cancel: cancelCharge,
};
