/**
 * Mapeamento Velana ↔ domínio DarkPay
 * Docs: https://velana.readme.io/reference/objeto-transaction
 *       https://velana.readme.io/reference/objeto-pix
 */

import type { Balances, SaqueStatus, VendaStatus } from "@/lib/domain/types";
import type {
  VelanaBalance,
  VelanaPixInfo,
  VelanaTransactionStatus,
  VelanaTransferStatus,
} from "./types";

/** R$ → centavos (Velana exige inteiro) */
export function toCents(reais: number): number {
  return Math.round(reais * 100);
}

/** Centavos → R$ */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function onlyDigits(v: string): string {
  return String(v || "").replace(/\D/g, "");
}

/**
 * Telefone no formato Velana: 11999999999 (DDD + número, só dígitos).
 * Docs customer: "no formato 11999999999"
 */
export function normalizeVelanaPhone(phone?: string): string {
  let d = onlyDigits(phone || "");
  // remove 55 país se veio com DDI
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length >= 10 && d.length <= 11) return d;
  // fallback válido para a API não rejeitar
  return "11999999999";
}

/**
 * CPF 11 / CNPJ 14 dígitos. type conforme docs: cpf | cnpj
 */
export function normalizeVelanaDocument(
  document?: string,
  hint?: "cpf" | "cnpj"
): { type: "cpf" | "cnpj"; number: string } {
  const number = onlyDigits(document || "");
  if (hint === "cnpj" || number.length > 11) {
    return {
      type: "cnpj",
      number: number.length === 14 ? number : number.padStart(14, "0").slice(-14),
    };
  }
  return {
    type: "cpf",
    number: number.length === 11 ? number : number.padStart(11, "0").slice(-11),
  };
}

export function mapVelanaTxStatus(
  status: VelanaTransactionStatus | string
): VendaStatus {
  const s = String(status).toLowerCase();
  switch (s) {
    case "paid":
    case "authorized":
      return "aprovada";
    case "waiting_payment":
    case "processing":
    case "partially_paid":
    case "in_protest":
      return "pendente";
    case "refunded":
      return "reembolsada";
    case "refused":
    case "canceled":
    case "cancelled":
    case "chargedback":
      return "recusada";
    default:
      return "pendente";
  }
}

export function mapVelanaTransferStatus(
  status: VelanaTransferStatus | string
): SaqueStatus {
  const s = String(status).toLowerCase();
  switch (s) {
    case "done":
    case "completed":
    case "transferred":
    case "paid":
      return "pago";
    case "failed":
    case "canceled":
    case "cancelled":
    case "refused":
      return "recusado";
    case "pending":
    case "bank_processing":
    case "processing":
    default:
      return "processando";
  }
}

export function mapVelanaBalance(b: VelanaBalance): Balances {
  return {
    available: fromCents(b.amount ?? 0),
    pending: 0,
    held: 0,
  };
}

/**
 * Extrai copia-e-cola (EMV) do objeto pix da resposta.
 * Campo oficial: pix.qrcode (string com o payload PIX).
 * Fallback: pix.url se vier EMV em vez de link.
 */
export function extractVelanaPixEmv(pix?: VelanaPixInfo | null): string {
  if (!pix) return "";
  const qr = String(pix.qrcode || "").trim();
  // EMV BR Code começa com 000201
  if (qr.startsWith("000201")) return qr;
  // alguns PSPs mandam o EMV sem prefixo validável, mas não é URL
  if (qr && !qr.startsWith("http") && !qr.startsWith("data:") && qr.length > 20) {
    return qr;
  }
  const url = String(pix.url || "").trim();
  if (url.startsWith("000201")) return url;
  return qr.startsWith("000201") ? qr : qr && !url.startsWith("http") ? qr : "";
}

/** Data de expiração do PIX (AAAA-MM-DD) → ISO end-of-day BRT-ish */
export function parseVelanaPixExpiration(
  expirationDate?: string | null
): string | null {
  if (!expirationDate) return null;
  const raw = String(expirationDate).trim();
  // já ISO
  if (raw.includes("T")) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  // AAAA-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T23:59:59.000-03:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}
