/**
 * Chave PIX — validação e normalização para saques.
 *
 * Política: destino livre. Qualquer chave válida (e-mail, telefone, CPF, CNPJ, EVP).
 * NÃO exige ser o mesmo documento/e-mail da conta do seller.
 * A adquirente (Velana/PodPay) valida e credita o destino.
 */

export type PixKeyKind = "email" | "phone" | "cpf" | "cnpj" | "evp";

/**
 * Normaliza chave PIX para envio à adquirente:
 * - email: lower + trim
 * - CPF/CNPJ/telefone: só dígitos (DDI 55 removido se presente)
 * - EVP: lower, mantém hífens se UUID
 */
export function normalizePixKey(raw: string): string {
  const k = String(raw ?? "").trim();
  if (!k) return "";
  if (k.includes("@")) return k.toLowerCase();

  if (
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      k
    )
  ) {
    return k.toLowerCase();
  }
  if (/^[0-9a-fA-F]{32}$/.test(k)) {
    return k.toLowerCase();
  }

  const digits = k.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 13) {
    if (
      (digits.length === 12 || digits.length === 13) &&
      digits.startsWith("55")
    ) {
      return digits.slice(2);
    }
    return digits;
  }
  if (digits.length === 11 || digits.length === 14) return digits;

  return k;
}

export function detectPixKeyKind(raw: string): PixKeyKind | null {
  const k = String(raw ?? "").trim();
  if (!k || k.length > 140) return null;
  if (/[<>"'`;\\]/.test(k)) return null;

  if (k.includes("@")) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k) && k.length <= 254) return "email";
    return null;
  }

  if (
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      k
    ) ||
    /^[0-9a-fA-F]{32}$/.test(k)
  ) {
    return "evp";
  }

  let digits = k.replace(/\D/g, "");
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  ) {
    digits = digits.slice(2);
  }

  // Telefone: 10 dígitos fixo ou 11 celular (3º dígito 9)
  if (digits.length === 10 && /^[1-9]{2}\d{8}$/.test(digits)) return "phone";
  if (digits.length === 11 && /^[1-9]{2}9\d{8}$/.test(digits)) return "phone";

  // CPF / CNPJ (qualquer, não precisa ser o da conta)
  if (digits.length === 11 && /^\d{11}$/.test(digits)) return "cpf";
  if (digits.length === 14 && /^\d{14}$/.test(digits)) return "cnpj";

  return null;
}

export function isValidPixKey(key: string): boolean {
  return detectPixKeyKind(key) != null;
}
