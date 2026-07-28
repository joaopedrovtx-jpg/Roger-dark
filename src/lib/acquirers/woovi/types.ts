/**
 * Tipos Woovi / OpenPix API
 * Docs: https://developers.openpix.com.br/en/api
 *       https://app.woovi.com/home/applications/tab/doc
 *
 * Auth: Authorization: <AppID>
 * Prod: https://api.openpix.com.br
 * Sandbox: https://api.woovi-sandbox.com
 * Valores em CENTAVOS
 */

export type WooviEnv = "live" | "sandbox";

export type WooviChargeStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "EXPIRED"
  | "ERROR"
  | string;

export interface WooviConfig {
  /** AppID da aplicação API (Authorization header) */
  appId: string;
  env: WooviEnv;
  baseUrl: string;
  postbackBaseUrl?: string;
}

export interface WooviCustomer {
  name?: string;
  email?: string;
  phone?: string;
  taxID?: string;
}

export interface WooviCreateCharge {
  correlationID: string;
  value: number;
  comment?: string;
  expiresIn?: number;
  customer?: WooviCustomer;
  additionalInfo?: Array<{ key: string; value: string }>;
}

export interface WooviCharge {
  status?: WooviChargeStatus;
  value?: number;
  comment?: string;
  correlationID?: string;
  transactionID?: string;
  identifier?: string;
  paymentLinkID?: string;
  paymentLinkUrl?: string;
  qrCodeImage?: string;
  brCode?: string;
  expiresIn?: number;
  expiresDate?: string;
  createdAt?: string;
  updatedAt?: string;
  paidAt?: string;
  fee?: number;
  globalID?: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    taxID?: { taxID?: string; type?: string } | string;
  };
  paymentMethods?: {
    pix?: {
      brCode?: string;
      qrCodeImage?: string;
      status?: string;
      transactionID?: string;
      value?: number;
      fee?: number;
    };
  };
  [key: string]: unknown;
}

export interface WooviCreateChargeResponse {
  charge?: WooviCharge;
  brCode?: string;
  correlationID?: string;
  [key: string]: unknown;
}

/**
 * PIX out — Payment Request (saque)
 * Docs: https://developers.woovi.com/en/docs/payment/payment-how-to-use-api-to-create
 * Approve: POST /api/v1/payment/approve
 * Auto: autoApprove: true
 */
export type WooviDestinationAliasType =
  | "CPF"
  | "CNPJ"
  | "EMAIL"
  | "PHONE"
  | "RANDOM";

export interface WooviCreatePayment {
  value: number;
  destinationAlias: string;
  destinationAliasType: WooviDestinationAliasType;
  correlationID: string;
  comment?: string;
  sourceAccountId?: string;
  /** true = cria e aprova em uma chamada (admin pay now) */
  autoApprove?: boolean;
}

export interface WooviApprovePayment {
  correlationID: string;
}

export interface WooviPayment {
  status?: string;
  value?: number;
  correlationID?: string;
  destinationAlias?: string;
  destinationAliasType?: WooviDestinationAliasType;
  sourceAccountId?: string;
  endToEndId?: string;
  comment?: string;
  [key: string]: unknown;
}

export interface WooviAccount {
  accountId?: string;
  isDefault?: boolean;
  balance?: {
    total?: number;
    blocked?: number;
    available?: number;
  };
  taxId?: string;
  officialName?: string;
  tradeName?: string;
}

export interface WooviWebhookPayload {
  event?: string;
  charge?: WooviCharge;
  payment?: WooviPayment;
  pix?: {
    value?: number;
    time?: string;
    endToEndId?: string;
    transactionID?: string;
    status?: string;
    charge?: WooviCharge;
  };
  transaction?: {
    value?: number;
    endToEndId?: string;
    time?: string;
  };
  error?: { code?: string; description?: string };
  company?: { id?: string; name?: string; taxID?: string };
  account?: { environment?: string };
  [key: string]: unknown;
}
