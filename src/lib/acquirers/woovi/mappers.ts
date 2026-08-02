/**
 * Mapeamento Woovi ↔ domínio DarkPay
 * Docs: https://app.woovi.com/home/applications/tab/doc
 */

import type { SaqueStatus, VendaStatus } from "@/lib/domain/types";
import { detectPixKeyKind, normalizePixKey } from "@/lib/pix-key";
import type {
  WooviCharge,
  WooviChargeStatus,
  WooviDestinationAliasType,
} from "./types";

export function toCents(reais: number): number {
  return Math.round(Math.max(0, Number(reais) || 0) * 100);
}

export function fromCents(cents: number): number {
  return Math.round(Number(cents) || 0) / 100;
}

export function mapWooviChargeStatus(
  status: WooviChargeStatus | string | undefined
): VendaStatus {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "COMPLETED":
    case "PAID":
    case "CONFIRMED":
    case "RECEIVED":
    case "APPROVED":
      return "aprovada";
    case "EXPIRED":
    case "CANCELED":
    case "CANCELLED":
    case "ERROR":
    case "FAILED":
      return "recusada";
    case "ACTIVE":
    case "PENDING":
    default:
      return "pendente";
  }
}

/**
 * Status efetivo do webhook: o evento OPENPIX:CHARGE_COMPLETED
 * manda aprovar mesmo se charge.status vier ACTIVE/vazio (payloads incompletos).
 */
export function mapWooviWebhookStatus(
  event: string | undefined,
  chargeStatus?: WooviChargeStatus | string | undefined
): VendaStatus {
  const ev = String(event || "").toUpperCase();
  // Prefixo OPENPIX: opcional; compara o sufixo do evento
  const name = ev.includes(":") ? ev.split(":").pop() || ev : ev;

  // MOVEMENT_* é PIX out (saque) — NÃO mapear como venda aprovada
  if (
    name === "CHARGE_COMPLETED" ||
    name === "TRANSACTION_RECEIVED" ||
    name === "PIX_RECEIVED"
  ) {
    return "aprovada";
  }
  if (
    name === "CHARGE_EXPIRED" ||
    name === "CHARGE_CANCELED" ||
    name === "CHARGE_CANCELLED"
  ) {
    return "recusada";
  }
  // Fallback: substring (payloads legados)
  if (ev.includes("CHARGE_COMPLETED")) return "aprovada";
  if (ev.includes("CHARGE_EXPIRED")) return "recusada";
  return mapWooviChargeStatus(chargeStatus);
}

/**
 * Status do payment (PIX out) na Woovi.
 *
 * APPROVED = admin/API liberou o envio, mas liquidação ainda pode estar
 * em andamento. Só CONFIRMED/COMPLETED/PAID = dinheiro liquidado.
 * O seller só vê "pago" quando a adquirente confirma (webhook).
 */
export function mapWooviPaymentStatus(
  status: string | undefined
): SaqueStatus {
  const s = String(status || "").toUpperCase();
  switch (s) {
    case "CONFIRMED":
    case "COMPLETED":
    case "PAID":
      return "pago";
    case "FAILED":
    case "REJECTED":
    case "CANCELED":
    case "CANCELLED":
    case "REMOVED":
      return "recusado";
    case "APPROVED": // liberado, aguardando liquidação
    case "CREATED":
    case "PENDING":
    case "WAITING":
    default:
      return "processando";
  }
}

/**
 * Mapeia chave PIX local → destinationAlias + destinationAliasType da Woovi.
 * Docs: CPF | CNPJ | EMAIL | PHONE | RANDOM
 */
export function toWooviPaymentDestination(pixKey: string): {
  destinationAlias: string;
  destinationAliasType: WooviDestinationAliasType;
} {
  const raw = String(pixKey || "").trim();
  const kind = detectPixKeyKind(raw);
  const norm = normalizePixKey(raw);

  if (kind === "email") {
    return { destinationAlias: norm, destinationAliasType: "EMAIL" };
  }
  if (kind === "phone") {
    // Woovi costuma aceitar +55DDDNUMERO
    const digits = norm.replace(/\D/g, "");
    const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
    return {
      destinationAlias: `+${withCountry}`,
      destinationAliasType: "PHONE",
    };
  }
  if (kind === "cpf") {
    return { destinationAlias: norm, destinationAliasType: "CPF" };
  }
  if (kind === "cnpj") {
    return { destinationAlias: norm, destinationAliasType: "CNPJ" };
  }
  // EVP / aleatória
  return { destinationAlias: norm || raw, destinationAliasType: "RANDOM" };
}

export function extractWooviBrCode(charge?: WooviCharge | null): string {
  if (!charge) return "";
  return (
    charge.brCode?.trim() ||
    charge.paymentMethods?.pix?.brCode?.trim() ||
    ""
  );
}

export function extractWooviQrImage(charge?: WooviCharge | null): string {
  if (!charge) return "";
  return (
    charge.qrCodeImage?.trim() ||
    charge.paymentMethods?.pix?.qrCodeImage?.trim() ||
    ""
  );
}

export function extractWooviCorrelationId(
  charge?: WooviCharge | null
): string {
  if (!charge) return "";
  return (
    charge.correlationID?.trim() ||
    charge.transactionID?.trim() ||
    charge.identifier?.trim() ||
    charge.paymentLinkID?.trim() ||
    (typeof charge.globalID === "string" ? charge.globalID.trim() : "") ||
    ""
  );
}

/** Todos os IDs possíveis de uma charge/payload para localizar a TX no DarkPay. */
export function collectWooviLookupIds(
  charge?: WooviCharge | null,
  extra?: { pixTransactionId?: string | null }
): string[] {
  const ids = new Set<string>();
  const push = (v?: string | null) => {
    const s = String(v || "").trim();
    if (s) ids.add(s);
  };
  push(charge?.correlationID);
  push(charge?.transactionID);
  push(charge?.identifier);
  push(charge?.paymentLinkID);
  push(typeof charge?.globalID === "string" ? charge.globalID : null);
  push(charge?.paymentMethods?.pix?.transactionID);
  push(extra?.pixTransactionId);
  // variants com prefixo local
  for (const id of [...ids]) {
    if (!id.startsWith("wo_")) ids.add(`wo_${id}`.slice(0, 64));
  }
  return [...ids].filter(Boolean);
}

export function onlyDigits(v: string): string {
  return String(v || "").replace(/\D/g, "");
}

/**
 * Texto seguro para a API Woovi (sem emoji, sem símbolos especiais problemáticos).
 * A API rejeita emoji no comment — preferimos NÃO reenviar título de oferta.
 */
export function sanitizeWooviText(raw: string, maxLen = 120): string {
  let s = String(raw ?? "");

  // Remove tudo que não seja letra, número, espaço ou pontuação básica ASCII/latin
  // (corta emoji, pictográficos, símbolos de marca, etc.)
  s = s.replace(/[^\p{L}\p{N}\s.,;:!?\-_/()@+#]/gu, "");
  s = s.replace(/[\u0000-\u001F\u007F]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s;
}

/** Nome do cliente para a API (sem emoji). */
export function sanitizeWooviCustomerName(raw?: string): string {
  const s = sanitizeWooviText(raw || "Cliente", 120);
  return s || "Cliente";
}

/**
 * Comment enviado à Woovi: SEMPRE texto fixo seguro.
 * Nunca repassa o título da oferta (pode ter emoji e quebra a API).
 */
export function wooviSafeComment(): string {
  return "Pagamento";
}

/** correlationID só com caracteres seguros */
export function sanitizeCorrelationId(raw: string): string {
  return String(raw || "")
    .replace(/[^a-zA-Z0-9_\-.]/g, "")
    .slice(0, 100);
}
