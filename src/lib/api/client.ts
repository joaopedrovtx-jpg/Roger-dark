/**
 * Cliente de dados DarkPay.
 * Mode: mock (local) | http (BFF/API real)
 */

import type {
  AdminMetrics,
  ApiListParams,
  ApiListResult,
  AuthUser,
  CreateWithdrawalInput,
  LoginInput,
  PeriodKey,
  PlatformBranding,
  RegisterInput,
  SellerDashboard,
  SellerProfile,
  Session,
  Transaction,
  Withdrawal,
} from "@/lib/domain/types";
import { mockAdapter } from "./adapters/mock";
import { httpAdapter } from "./adapters/http";

export type DataMode = "mock" | "http";

export interface DarkPayApi {
  // Auth
  login(input: LoginInput): Promise<Session>;
  register(input: RegisterInput): Promise<Session>;
  logout(): Promise<void>;
  me(): Promise<AuthUser | null>;
  forgotPassword(email: string): Promise<{ ok: boolean }>;
  resetPassword(input: {
    email: string;
    code: string;
    password: string;
  }): Promise<{ ok: boolean }>;

  // Seller
  getDashboard(period: PeriodKey): Promise<SellerDashboard>;
  getTransactions(
    params?: ApiListParams
  ): Promise<ApiListResult<Transaction>>;
  getFinance(): Promise<{
    balances: SellerProfile["balances"];
    withdrawals: Withdrawal[];
    totalOut: number;
  }>;
  createWithdrawal(input: CreateWithdrawalInput): Promise<Withdrawal>;
  getProfile(): Promise<SellerProfile>;

  // Branding
  getBranding(): Promise<PlatformBranding>;
  updateBranding(branding: PlatformBranding): Promise<PlatformBranding>;

  // Admin
  getAdminMetrics(period?: PeriodKey): Promise<AdminMetrics>;
  listSellers(params?: ApiListParams): Promise<ApiListResult<SellerProfile>>;
  listWithdrawalsAdmin(
    params?: ApiListParams
  ): Promise<ApiListResult<Withdrawal>>;
  setWithdrawalStatus(
    id: string,
    status: Withdrawal["status"]
  ): Promise<Withdrawal>;

  // Payments (PIX)
  createPayment(input: {
    amount: number;
    description?: string;
    customerName?: string;
    customerDocument?: string;
    metadata?: Record<string, string>;
  }): Promise<import("@/lib/server/memory-store").PaymentCharge>;
  getPayment(
    id: string
  ): Promise<import("@/lib/server/memory-store").PaymentCharge | null>;
  listPayments(): Promise<import("@/lib/server/memory-store").PaymentCharge[]>;
  simulatePaymentPaid(
    id: string
  ): Promise<import("@/lib/server/memory-store").PaymentCharge>;
}

function resolveMode(): DataMode {
  if (typeof process !== "undefined") {
    const m = process.env.NEXT_PUBLIC_DARKPAY_DATA_MODE;
    if (m === "http" || m === "mock") return m;
  }
  // padrão REAL: BFF / API (não mock em memória)
  return "http";
}

export function getApi(): DarkPayApi {
  return resolveMode() === "http" ? httpAdapter : mockAdapter;
}

/** Singleton conveniente */
export const api = {
  get mode() {
    return resolveMode();
  },
  get client() {
    return getApi();
  },
};
