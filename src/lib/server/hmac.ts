import { createHmac, timingSafeEqual } from "crypto";
import { isProduction } from "@/lib/server/security";

/**
 * Valida assinatura HMAC do webhook PodPay.
 *
 * Produção: secret OBRIGATÓRIO + signature OBRIGATÓRIA.
 * Dev: sem secret aceita (com reason); com secret, valida se signature vier.
 */
export function verifyPodPaySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): { ok: boolean; reason?: string } {
  const secretTrim = secret?.trim();
  const prod = isProduction() || process.env.REQUIRE_WEBHOOK_HMAC === "1";

  if (!secretTrim) {
    if (prod) {
      return { ok: false, reason: "webhook_secret_required" };
    }
    return { ok: true, reason: "secret_not_configured_dev" };
  }

  const sig = signatureHeader?.trim();
  if (!sig) {
    if (prod || process.env.PODPAY_ENV === "live") {
      return { ok: false, reason: "missing_signature" };
    }
    return { ok: true, reason: "signature_empty_allowed_sandbox" };
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
 * Velana postbacks:
 * - Se VELANA_WEBHOOK_SECRET setado → HMAC obrigatório
 * - Produção: sem secret, só aceita se VELANA_ALLOW_UNSIGNED_WEBHOOK=1
 *   (a doc Velana nem sempre documenta HMAC; prefira secret compartilhado)
 * - REQUIRE_WEBHOOK_HMAC=1 ou VELANA_REQUIRE_HMAC=1 → fail-closed sem secret
 */
export function verifyVelanaWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
): { ok: boolean; reason?: string } {
  const secretTrim = secret?.trim();
  const prod = isProduction() || process.env.REQUIRE_WEBHOOK_HMAC === "1";
  const force =
    process.env.VELANA_REQUIRE_HMAC === "1" ||
    process.env.REQUIRE_WEBHOOK_HMAC === "1";
  const allowUnsigned =
    process.env.VELANA_ALLOW_UNSIGNED_WEBHOOK === "1" ||
    process.env.VELANA_ALLOW_UNSIGNED_WEBHOOK === "true";

  if (!secretTrim) {
    if (force) {
      return { ok: false, reason: "velana_webhook_secret_required" };
    }
    if (prod && !allowUnsigned) {
      // Fail-closed em produção: force opt-in para postback sem HMAC
      return { ok: false, reason: "velana_unsigned_blocked_in_prod" };
    }
    return { ok: true, reason: "velana_hmac_optional" };
  }

  if (!signatureHeader?.trim()) {
    return { ok: false, reason: "missing_signature" };
  }

  return verifyPodPaySignature(rawBody, signatureHeader, secretTrim);
}
