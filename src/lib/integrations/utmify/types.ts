/** Payload oficial UTMify — POST /api-credentials/orders */

export type UtmifyPaymentMethod =
  | "credit_card"
  | "boleto"
  | "pix"
  | "paypal"
  | "free_price";

export type UtmifyOrderStatus =
  | "waiting_payment"
  | "paid"
  | "refused"
  | "refunded"
  | "chargedback";

export type UtmifyCustomer = {
  name: string;
  email: string;
  phone: string | null;
  document: string | null;
  country?: string;
  ip?: string;
};

export type UtmifyProduct = {
  id: string;
  name: string;
  planId: string | null;
  planName: string | null;
  quantity: number;
  priceInCents: number;
};

export type UtmifyTrackingParameters = {
  src: string | null;
  sck: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_content: string | null;
  utm_term: string | null;
};

export type UtmifyCommission = {
  totalPriceInCents: number;
  gatewayFeeInCents: number;
  userCommissionInCents: number;
  currency?: string;
};

export type UtmifyOrderPayload = {
  orderId: string;
  platform: string;
  paymentMethod: UtmifyPaymentMethod;
  status: UtmifyOrderStatus;
  /** UTC 0: YYYY-MM-DD HH:MM:SS */
  createdAt: string;
  approvedDate: string | null;
  refundedAt: string | null;
  customer: UtmifyCustomer;
  products: UtmifyProduct[];
  trackingParameters: UtmifyTrackingParameters;
  commission: UtmifyCommission;
  isTest?: boolean;
};

export type UtmifySendResult =
  | { ok: true; status: number }
  | { ok: false; status: number; error: string };
