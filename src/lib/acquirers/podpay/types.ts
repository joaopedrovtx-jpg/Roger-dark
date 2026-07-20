/**
 * Tipos PodPay API v1 espelho da OpenAPI docs.podpay.app
 * Valores monetários em CENTAVOS (inteiros).
 */

export type PodPayEnv = "live" | "sandbox";

export type PodPayPaymentMethod = "pix" | "credit_card" | "boleto";

export type PodPayTransactionStatus =
  | "PENDING"
  | "PROCESSING"
  | "PAID"
  | "FAILED"
  | "CANCELED"
  | "BLOCKED"
  | "REFUNDED"
  | "PRE_CHARGEBACK"
  | "CHARGEBACK"
  // docs também citam lowercase em alguns trechos
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "canceled"
  | "refunded";

export type PodPayWithdrawalStatus =
  | "pending"
  | "pending_approval"
  | "processing"
  | "completed"
  | "failed"
  | "canceled";

export type PodPayPixKeyType =
  | "phone"
  | "email"
  | "cpf"
  | "cnpj"
  | "evp"
  | "copypaste";

export interface PodPayCustomer {
  document: {
    type: "cpf" | "cnpj";
    number: string; // só dígitos
  };
  name: string;
  email: string;
  phone: string; // DDD+número
}

export interface PodPayItem {
  title: string;
  unitPrice: number; // centavos
  quantity: number;
  tangible: boolean;
}

export interface PodPayCreateTransaction {
  paymentMethod: PodPayPaymentMethod;
  customer: PodPayCustomer;
  amount: number; // centavos, min 100
  installments?: number;
  items: PodPayItem[];
  postbackUrl?: string;
}

export interface PodPayTransaction {
  id: string;
  companyId?: string;
  currency?: "BRL";
  status: PodPayTransactionStatus;
  amount: number;
  paymentMethod: PodPayPaymentMethod;
  customer?: PodPayCustomer;
  pixQrCode?: string;
  pixQrCodeImage?: string;
  boletoUrl?: string;
  createdAt?: string;
}

export interface PodPayCreateWithdrawal {
  method: "fiat" | "crypto";
  amount: number; // centavos
  netPayout?: boolean;
  pixKey?: string;
  pixKeyType?: PodPayPixKeyType;
  coin?: string;
  walletAddress?: string;
  walletNetwork?: string;
}

export interface PodPayWithdrawal {
  id: string;
  method: "fiat" | "crypto";
  status: PodPayWithdrawalStatus;
  amount: number;
  fee?: number;
  netAmount?: number;
  createdAt?: string;
  completedAt?: string;
  failureReason?: string;
}

export interface PodPayBalance {
  amount: number; // disponível sacável
  waitingFunds: number; // a liberar
  maxAntecipable: number;
  reserve: number; // reserva / retido
}

export interface PodPayApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp?: string;
    version?: string;
    requestId?: string;
  };
}

export type PodPayWebhookEvent =
  | "transaction.completed"
  | "transaction.failed"
  | "transaction.pending"
  | "transaction.refunded"
  | "withdrawal.completed"
  | "withdrawal.failed"
  | "withdrawal.canceled";

export interface PodPayWebhookPayload {
  event: PodPayWebhookEvent | string;
  timestamp: string;
  data: Record<string, unknown>;
  signature?: string;
  version?: string;
  eventId: string;
  retryCount?: number;
  source?: string;
}

export interface PodPayConfig {
  apiKey: string;
  env: PodPayEnv;
  baseUrl: string;
  webhookSecret?: string;
  postbackBaseUrl?: string;
}

// ─── Checkout (docs.podpay.app) ─────────────────────────

export interface PodPayCheckoutLineItem {
  productId: string;
  quantity: number;
  sortOrder: number;
}

export interface PodPayCheckoutCreateSessionRequest {
  successUrl: string;
  cancelUrl: string;
  lineItems: PodPayCheckoutLineItem[];
  /** duração em minutos (5–10080), default 2880 */
  expiresAt?: number;
  postbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PodPayCheckoutSessionCreated {
  sessionId: string;
  expiresAt: string;
  checkoutUrl: string;
  idempotentReplay?: boolean;
}

export interface PodPayCheckoutPayRequest {
  customer: PodPayCustomer;
}

export interface PodPayCheckoutPayResponse {
  sessionId: string;
  status: string;
  expiresAt: string;
  transactionId?: string;
  amountCents: number;
  pixQrCode?: string;
  pixQrCodeImage?: string;
  successUrl?: string | null;
  cancelUrl?: string | null;
}

export interface PodPayCheckoutApplyCouponRequest {
  code: string;
}

export interface PodPayCheckoutApplyCouponResponse {
  sessionId: string;
  subtotalAmount: number;
  discountAmount: number;
  totalAmount: number;
  coupon?: {
    code?: string;
    discountType?: string;
    appliedAmount?: number;
  };
}
