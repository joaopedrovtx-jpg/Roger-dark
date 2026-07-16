import { createHmac, timingSafeEqual } from "crypto";

/**
 * Valida assinatura HMAC do webhook PodPay.
 * Se PODPAY_WEBHOOK_SECRET estiver vazio, aceita (modo dev/sandbox sem secret).
 * Se secret existir e signature vier, valida; se signature faltar com secret obrigatório → falha.
 */
export function verifyPodPaySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): { ok: boolean; reason?: string } {
  const secretTrim = secret?.trim();
  if (!secretTrim) {
    return { ok: true, reason: "secret_not_configured" };
  }

  const sig = signatureHeader?.trim();
  if (!sig) {
    // Doc PodPay: signature ainda pode vir vazio — em live com secret, exija
    if (process.env.PODPAY_ENV === "live") {
      return { ok: false, reason: "missing_signature" };
    }
    return { ok: true, reason: "signature_empty_allowed_sandbox" };
  }

  const expected = createHmac("sha256", secretTrim)
    .update(rawBody, "utf8")
    .digest("hex");

  // aceita hex puro ou prefixo sha256=
  const provided = sig.replace(/^sha256=/i, "").trim();

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length || a.length === 0) {
      return { ok: false, reason: "signature_mismatch" };
    }
    const match = timingSafeEqual(a, b);
    return match
      ? { ok: true }
      : { ok: false, reason: "signature_mismatch" };
  } catch {
    return { ok: false, reason: "signature_invalid" };
  }
}
