/**
 * Mapeamento PodPay ↔ domínio DarkPay
 */

import type {
  Balances,
  SaqueStatus,
  VendaStatus,
} from "@/lib/domain/types";
import type {
  PodPayBalance,
  PodPayPixKeyType,
  PodPayTransactionStatus,
  PodPayWithdrawalStatus,
} from "./types";

/** R$ → centavos */
export function toCents(reais: number): number {
  return Math.round(reais * 100);
}

/** Centavos → R$ */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function mapPodPayTxStatus(
  status: PodPayTransactionStatus | string
): VendaStatus {
  const s = String(status).toUpperCase();
  switch (s) {
    case "PAID":
      return "aprovada";
    case "PENDING":
    case "PROCESSING":
      return "pendente";
    case "REFUNDED":
      return "reembolsada";
    case "FAILED":
    case "CANCELED":
    case "CANCELLED":
    case "BLOCKED":
    case "CHARGEBACK":
    case "PRE_CHARGEBACK":
      return "recusada";
    default:
      return "pendente";
  }
}

export function mapPodPayWithdrawalStatus(
  status: PodPayWithdrawalStatus | string
): SaqueStatus {
  const s = String(status).toLowerCase();
  switch (s) {
    case "completed":
      return "pago";
    case "failed":
    case "canceled":
    case "cancelled":
      return "recusado";
    case "pending":
    case "pending_approval":
    case "processing":
    default:
      return "processando";
  }
}

export function mapPodPayBalance(b: PodPayBalance): Balances {
  return {
    available: fromCents(b.amount ?? 0),
    pending: fromCents(b.waitingFunds ?? 0),
    held: fromCents(b.reserve ?? 0),
  };
}

/** Detecta tipo de chave PIX a partir do valor */
export function detectPixKeyType(key: string): PodPayPixKeyType {
  const k = key.trim();
  if (k.includes("@")) return "email";
  const digits = k.replace(/\D/g, "");
  if (digits.length === 11 && /^[1-9]{2}9?\d{8}$/.test(digits)) {
    // telefone BR: DDD + 9 dígitos (ou 8)
    if (digits.length === 11 && digits[2] === "9") return "phone";
  }
  if (digits.length === 11) return "cpf";
  if (digits.length === 14) return "cnpj";
  if (k.includes("000201")) return "copypaste";
  return "evp";
}

export function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}
