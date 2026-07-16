/**
 * Domínio unificado DarkPay — seller + admin.
 * Fonte de verdade de tipos para API, Prisma (espelho) e UI.
 */

export type Role = "seller" | "admin" | "manager";

export type UserStatus = "ativo" | "pendente" | "bloqueado";
export type PersonType = "pf" | "pj";
export type DocReviewStatus = "pendente" | "aprovado" | "rejeitado";
export type SellerDocKind =
  | "selfie"
  | "doc_frente"
  | "doc_verso"
  | "contrato_social";

export type TransactionKind = "venda" | "saque";
export type TransactionDirection = "entrada" | "saida";
export type VendaStatus =
  | "pendente"
  | "aprovada"
  | "recusada"
  | "reembolsada";
export type SaqueStatus = "processando" | "pago" | "recusado";

export type AdquirenteStatus = "ativo" | "inativo" | "manutencao";
export type RoutingMode = "plataforma" | "personalizado";

export type PeriodKey =
  | "today"
  | "yesterday"
  | "7d"
  | "15d"
  | "30d"
  | "60d";

// ─── Auth ───────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: UserStatus;
  avatarUrl?: string | null;
  displayName?: string;
}

export interface Session {
  user: AuthUser;
  token: string;
  expiresAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

// ─── Seller / User ──────────────────────────────────────

export interface SellerFees {
  mdrPercent: number;
  mdrFixed: number;
  saquePercent: number;
  saqueFixed: number;
}

export interface Balances {
  available: number;
  pending: number;
  held: number;
}

export interface SellerProfile {
  id: string;
  name: string;
  email: string;
  document: string;
  phone: string;
  status: UserStatus;
  personType: PersonType;
  displayName?: string;
  company?: string;
  cnpj?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  avatarUrl?: string | null;
  createdAt: string;
  balances: Balances;
  volumeTotal: number;
  platformProfit: number;
  fees: SellerFees;
  saqueAutomatico: boolean;
  routingMode: RoutingMode;
  preferredAdquirenteId?: string | null;
  adquirenteIds: string[];
}

// ─── Transactions & withdrawals ─────────────────────────

export interface Transaction {
  id: string;
  date: string;
  sellerId: string;
  sellerName?: string;
  kind: TransactionKind;
  direction: TransactionDirection;
  description: string;
  method: string;
  amount: number;
  status: VendaStatus | SaqueStatus | string;
  customer?: string;
  product?: string;
}

export interface Withdrawal {
  id: string;
  sellerId: string;
  sellerName: string;
  date: string;
  amount: number;
  method: string;
  destination: string;
  status: SaqueStatus;
  feePercent?: number;
  feeFixed?: number;
}

export interface CreateWithdrawalInput {
  amount: number;
  pixKey: string;
}

// ─── Documents ──────────────────────────────────────────

export interface DocumentRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  kind: SellerDocKind;
  typeLabel: string;
  submittedAt: string;
  status: DocReviewStatus;
  previewUrl?: string | null;
  notes?: string;
}

// ─── Acquirers ──────────────────────────────────────────

export interface Acquirer {
  id: string;
  name: string;
  code: string;
  status: AdquirenteStatus;
  feePercent: number;
  feeFixed: number;
  volumeMes: number;
  transactionsMes: number;
  settlement: string;
  priority: number;
  conversionRate: number;
}

// ─── Managers ───────────────────────────────────────────

export type GerentePermission =
  | "dashboard"
  | "usuarios"
  | "documentos"
  | "saques"
  | "adquirentes"
  | "gerentes";

export interface Manager {
  id: string;
  name: string;
  email: string;
  status: "ativo" | "inativo";
  userId?: string;
  sellersCount: number;
  volumeTotal: number;
  permissions: GerentePermission[];
}

// ─── Branding ───────────────────────────────────────────

export interface BrandBanner {
  id: string;
  imageUrl: string;
  name: string;
  linkUrl: string;
}

export interface PlatformBranding {
  logoUrl: string;
  faviconUrl: string;
  banners: BrandBanner[];
  authImageUrl: string;
}

// ─── Dashboard aggregates ───────────────────────────────

export interface SellerDashboard {
  user: Pick<AuthUser, "id" | "name" | "avatarUrl">;
  balances: Balances;
  metrics: {
    netProfit: number;
    transactionCount: number;
    averageTicket: number;
    totalOut: number;
  };
  conversionRate: number;
  revenueHistory: Array<{ date: string; amount: number; grain?: "hour" | "day" }>;
  volumeGoal?: { current: number; target: number };
}

export interface AdminMetrics {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  blockedUsers: number;
  pendingDocs: number;
  pendingSaques: number;
  pendingSaquesAmount: number;
  volumeProcessed: number;
  /** Lucro total (MDR vendas + taxas de saque) */
  platformRevenue: number;
  platformRevenueSales?: number;
  platformRevenueWithdrawals?: number;
  activeAdquirentes: number;
  totalTransactions: number;
  averageTicket: number;
  totalHeldBalance: number;
  totalAvailableBalance?: number;
  totalPendingBalance?: number;
  conversionRate: number;
}

// ─── API envelope ───────────────────────────────────────

export interface ApiListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  period?: PeriodKey;
}

export interface ApiListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}
