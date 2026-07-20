/**
 * Tipos Velana API v1 espelho da documentação oficial
 * https://velana.readme.io/reference/introducao
 * https://velana.readme.io/reference/criar-transacao
 *
 * Auth: Authorization: Basic base64("{SECRET_KEY}:x")
 * Base: https://api.velana.com.br/v1
 * Valores monetários em CENTAVOS (inteiros)
 */

export type VelanaEnv = "live" | "sandbox";

/** Meios de pagamento da Velana */
export type VelanaPaymentMethod = "pix" | "credit_card" | "boleto";

/**
 * Status oficiais (listar-transacoes / objeto-transaction):
 * processing | authorized | paid | refunded | waiting_payment |
 * refused | chargedback | canceled | in_protest | partially_paid
 */
export type VelanaTransactionStatus =
  | "processing"
  | "authorized"
  | "paid"
  | "refunded"
  | "waiting_payment"
  | "refused"
  | "chargedback"
  | "canceled"
  | "in_protest"
  | "partially_paid";

export type VelanaTransferStatus =
  | "pending"
  | "bank_processing"
  | "done"
  | "failed"
  | "canceled"
  | string;

/** customer.document objeto document */
export interface VelanaDocument {
  number: string;
  type: "cpf" | "cnpj";
}

/**
 * customer na criação (POST /transactions)
 * required: name, email
 * opcional: id, document, phone (formato 11999999999), externalRef
 */
export interface VelanaCustomer {
  id?: string | number;
  name: string;
  email: string;
  phone?: string;
  document?: VelanaDocument;
  externalRef?: string;
  birthdate?: string;
  address?: VelanaAddress;
}

/** address (shipping / customer) */
export interface VelanaAddress {
  street: string;
  streetNumber: string;
  complement?: string | null;
  zipCode: string;
  neighborhood: string;
  city: string;
  /** 2 letras maiúsculas, ex: SP */
  state: string;
  /** 2 dígitos, ex: br */
  country: string;
}

/**
 * item required: title, unitPrice, quantity, tangible
 * unitPrice em centavos
 */
export interface VelanaItem {
  title: string;
  unitPrice: number;
  quantity: number;
  tangible: boolean;
  externalRef?: string;
}

/**
 * Resposta pix (objeto-pix):
 * qrcode, url, expirationDate (AAAA-MM-DD), createdAt
 */
export interface VelanaPixInfo {
  qrcode?: string;
  url?: string;
  expirationDate?: string;
  createdAt?: string;
}

/**
 * Body POST /v1/transactions
 * required: amount, paymentMethod, customer, items
 *
 * PIX: paymentMethod = "pix" + opcional pix.expiresInDays
 * Docs: https://velana.readme.io/reference/criar-transacao
 */
export interface VelanaCreateTransaction {
  /** Valor total em centavos (500 = R$ 5,00) */
  amount: number;
  paymentMethod: VelanaPaymentMethod;
  customer: VelanaCustomer;
  items: VelanaItem[];
  /** Obrigatório só para credit_card */
  installments?: number;
  card?: Record<string, unknown>;
  /** Expiração do PIX em dias */
  pix?: { expiresInDays?: number };
  boleto?: { expiresInDays?: number };
  /** URL que recebe postbacks de status */
  postbackUrl?: string;
  /** Metadados (string na API Velana) */
  metadata?: string;
  /** IP do cliente pagador */
  ip?: string;
  /** Status de entrega gerenciado no painel (default false) */
  traceable?: boolean;
  shipping?: {
    fee: number;
    address?: VelanaAddress;
  };
  splits?: Array<{
    recipientId: number;
    amount: number;
    chargeProcessingFee?: boolean;
  }>;
}

export interface VelanaTransaction {
  id: number | string;
  amount: number;
  refundedAmount?: number;
  companyId?: number;
  installments?: number;
  paymentMethod?: VelanaPaymentMethod | string;
  status: VelanaTransactionStatus | string;
  postbackUrl?: string | null;
  metadata?: unknown;
  traceable?: boolean;
  secureId?: string;
  secureUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  paidAt?: string | null;
  ip?: string | null;
  externalRef?: string | null;
  customer?: VelanaCustomer;
  pix?: VelanaPixInfo | null;
  boleto?: unknown;
  card?: unknown;
  shipping?: unknown;
  refusedReason?: unknown;
  items?: VelanaItem[];
  refunds?: unknown[];
  delivery?: unknown;
  fee?: {
    fixedAmount?: number;
    spreadPercentage?: number;
    estimatedFee?: number;
    netAmount?: number;
  };
  splits?: Array<{
    recipientId: number;
    amount: number;
    netAmount?: number;
  }>;
  [key: string]: unknown;
}

export interface VelanaCreateTransfer {
  amount: number;
  pixKey?: string;
  postbackUrl?: string;
  recipientId?: number;
  externalRef?: string;
  bankAccount?: {
    bankCode: string;
    agencyNumber: string;
    accountNumber: string;
    accountDigit: string;
    type: "conta_corrente" | "conta_poupanca" | string;
    legalName: string;
    documentNumber: string;
    documentType: "cpf" | "cnpj";
  };
}

export interface VelanaTransfer {
  id: number | string;
  amount: number;
  fee?: number;
  status: VelanaTransferStatus;
  pixKey?: string | null;
  failReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  transferredAt?: string | null;
  externalRef?: string | null;
  postbackUrl?: string | null;
  [key: string]: unknown;
}

export interface VelanaBalance {
  amount: number;
  recipientId?: number;
}

export interface VelanaConfig {
  secretKey: string;
  env: VelanaEnv;
  baseUrl: string;
  publicKey?: string;
  postbackBaseUrl?: string;
}

/** Postback: type transaction | checkout | transfer */
export interface VelanaPostbackPayload {
  id?: number | string;
  type: "transaction" | "checkout" | "transfer" | string;
  objectId?: string;
  url?: string;
  data: Record<string, unknown>;
}
