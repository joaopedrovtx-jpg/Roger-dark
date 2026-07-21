import { createHmac, timingSafeEqual } from "crypto";
import { isProduction } from "@/lib/server/security";

/**
 * Valida assinatura HMAC do webhook PodPay.
 * Fail-closed: sem secret ou sem signature → rejeita (exceto ALLOW_UNSIGNED_WEBHOOKS=1 e NÃO produção).
 */
export function verifyPodPaySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): { ok: boolean; reason?: string } {
  const secretTrim = secret?.trim();
  const allowUnsigned =
    !isProduction() &&
    (process.env.ALLOW_UNSIGNED_WEBHOOKS === "1" ||
      process.env.ALLOW_UNSIGNED_WEBHOOKS === "true");

  if (!secretTrim) {
    if (allowUnsigned) {
      return { ok: true, reason: "unsigned_allowed_explicit_dev" };
    }
    return { ok: false, reason: "webhook_secret_required" };
  }

  const sig = signatureHeader?.trim();
  if (!sig) {
    if (allowUnsigned) {
      return { ok: true, reason: "signature_empty_allowed_explicit_dev" };
    }
    return { ok: false, reason: "missing_signature" };
  }

  const expected = createHmac("sha256", secretTrim)
    .update(rawBody, "utf8")
    .digest("hex");

  const provided = sig.replace(/^sha256=/i, "").trim();

  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length || a.length === 0) {
      return { ok: false, reason: "signature_mismatch" };
    }
    const match = timingSafeEqual(a, b);
    return match ? { ok: true } : { ok: false, reason: "signature_mismatch" };
  } catch {
    return { ok: false, reason: "signature_invalid" };
  }
}

/**
 * Velana postbacks — mesmo fail-closed que PodPay.
 * VELANA_ALLOW_UNSIGNED_WEBHOOK=1 só vale fora de produção.
 */
export function verifyVelanaWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): { ok: boolean; reason?: string } {
  const secretTrim = secret?.trim();
  const allowUnsigned =
    !isProduction() &&
    (process.env.VELANA_ALLOW_UNSIGNED_WEBHOOK === "1" ||
      process.env.VELANA_ALLOW_UNSIGNED_WEBHOOK === "true" ||
      process.env.ALLOW_UNSIGNED_WEBHOOKS === "1");

  if (!secretTrim) {
    if (allowUnsigned) {
      return { ok: true, reason: "velana_unsigned_allowed_explicit_dev" };
    }
    return { ok: false, reason: "velana_webhook_secret_required" };
  }

  if (!signatureHeader?.trim()) {
    if (allowUnsigned) {
      return { ok: true, reason: "velana_signature_empty_allowed_explicit_dev" };
    }
    return { ok: false, reason: "missing_signature" };
  }

  return verifyPodPaySignature(rawBody, signatureHeader, secretTrim);
}
