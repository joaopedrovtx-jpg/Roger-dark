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

export type DataMode = "mock" | "http";

export interface DarkPayApi {
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

  getBranding(): Promise<PlatformBranding>;
  updateBranding(branding: PlatformBranding): Promise<PlatformBranding>;

  getAdminMetrics(period?: PeriodKey): Promise<AdminMetrics>;
  listSellers(params?: ApiListParams): Promise<ApiListResult<SellerProfile>>;
  listWithdrawalsAdmin(
    params?: ApiListParams
  ): Promise<ApiListResult<Withdrawal>>;
  setWithdrawalStatus(
    id: string,
    status: Withdrawal["status"]
  ): Promise<Withdrawal>;

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
