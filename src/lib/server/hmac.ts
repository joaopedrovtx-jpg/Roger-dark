import { createHmac, timingSafeEqual } from "crypto";
import { isProduction } from "@/lib/server/security";

/**
 * Woovi/OpenPix webhook.
 * Se WOOVI_WEBHOOK_SECRET estiver setado → exige Authorization/header igual ao secret.
 * Se NÃO estiver setado → ok (reconfirmação na API cobre o risco; não quebra deploy atual).
 */
export function verifyWooviWebhook(
  req: Request,
  secret: string | undefined
): { ok: boolean; reason?: string; signed: boolean } {
  const secretTrim = secret?.trim();
  if (!secretTrim) {
    if (
      !isProduction() &&
      (process.env.ALLOW_UNSIGNED_WEBHOOKS === "1" ||
        process.env.WOOVI_ALLOW_UNSIGNED_WEBHOOK === "1")
    ) {
      return { ok: true, reason: "woovi_unsigned_dev", signed: false };
    }
    return { ok: false, reason: "woovi_secret_not_configured", signed: false };
  }

  const auth =
    req.headers.get("authorization")?.trim() ||
    req.headers.get("x-webhook-authorization")?.trim() ||
    req.headers.get("x-openpix-signature")?.trim() ||
    req.headers.get("x-woovi-signature")?.trim() ||
    "";

  if (!auth) {
    if (
      !isProduction() &&
      (process.env.ALLOW_UNSIGNED_WEBHOOKS === "1" ||
        process.env.WOOVI_ALLOW_UNSIGNED_WEBHOOK === "1")
    ) {
      return { ok: true, reason: "woovi_unsigned_dev", signed: false };
    }
    return { ok: false, reason: "missing_woovi_auth", signed: false };
  }

  // Aceita: "Bearer SECRET", "SECRET", ou raw secret
  const provided = auth.replace(/^Bearer\s+/i, "").trim();
  try {
    const a = Buffer.from(secretTrim, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length) {
      return { ok: false, reason: "woovi_auth_mismatch", signed: false };
    }
    const match = timingSafeEqual(a, b);
    return match
      ? { ok: true, signed: true }
      : { ok: false, reason: "woovi_auth_mismatch", signed: false };
  } catch {
    return { ok: false, reason: "woovi_auth_invalid", signed: false };
  }
}

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
): { ok: boolean; reason?: string; signed?: boolean } {
  const secretTrim = secret?.trim();
  const allowUnsigned =
    !isProduction() &&
    (process.env.VELANA_ALLOW_UNSIGNED_WEBHOOK === "1" ||
      process.env.VELANA_ALLOW_UNSIGNED_WEBHOOK === "true" ||
      process.env.ALLOW_UNSIGNED_WEBHOOKS === "1");

  // Velana frequentemente envia postback SEM HMAC. Em produção, se NÃO há secret
  // configurado, aceita unsigned mas signed=false → caller DEVE reconfirmar na API.
  // Se há secret, exige assinatura válida (fail-closed).
  if (!secretTrim) {
    if (isProduction() || allowUnsigned) {
      return {
        ok: true,
        signed: false,
        reason: isProduction()
          ? "velana_unsigned_no_secret_reconfirm_required"
          : "velana_unsigned_allowed_explicit_dev",
      };
    }
    return { ok: false, reason: "velana_webhook_secret_required", signed: false };
  }

  if (!signatureHeader?.trim()) {
    // Secret configurado mas Velana não mandou header: reconfirm path
    if (isProduction() || allowUnsigned) {
      return {
        ok: true,
        signed: false,
        reason: "velana_signature_missing_reconfirm_required",
      };
    }
    return { ok: false, reason: "missing_signature", signed: false };
  }

  const check = verifyPodPaySignature(rawBody, signatureHeader, secretTrim);
  if (!check.ok) return { ...check, signed: false };
  return { ok: true, signed: true };
}
