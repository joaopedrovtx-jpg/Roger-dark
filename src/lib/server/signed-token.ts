/**
 * Tokens assinados (HMAC) para middleware / challenges sem DB no Edge.
 */
import { createHmac, timingSafeEqual, randomBytes } from "crypto";

const WEAK_FALLBACK = `dev-insecure-${randomBytes(12).toString("hex")}`;

export function resolveSessionSecret(): {
  secret: string;
  weak: boolean;
  missing: boolean;
} {
  const s =
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (s.length >= 32 && !/change-me|darkpay-dev|example/i.test(s)) {
    return { secret: s, weak: false, missing: false };
  }
  if (process.env.NODE_ENV === "production") {
    return { secret: s, weak: true, missing: s.length < 32 };
  }
  if (s.length >= 16) {
    return { secret: s, weak: true, missing: false };
  }
  return { secret: WEAK_FALLBACK, weak: true, missing: true };
}

function secret(): string {
  const { secret: s, weak, missing } = resolveSessionSecret();
  if (process.env.NODE_ENV === "production" && (missing || weak || s.length < 32)) {
    throw new Error(
      "SESSION_SECRET obrigatório em produção (openssl rand -hex 32)"
    );
  }
  return s;
}

export function signPayload(payload: string): string {
  const body = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifySignedPayload(
  token: string
): { ok: true; payload: string } | { ok: false; reason: string } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "format" };
  const [body, sig] = parts;
  let expected: string;
  try {
    expected = createHmac("sha256", secret())
      .update(body)
      .digest("base64url");
  } catch {
    return { ok: false, reason: "secret" };
  }
  try {
    // Decodifica explicitamente como base64url — a versão anterior usava
    // Buffer.from(str) sem encoding e funcionava por acidente (ambos os
    // lados sofriam o mesmo bug de encoding), o que tornava a comparação
    // frágil. Codificar explicitamente garante interoperabilidade e
    // comportamento previsível.
    const a = Buffer.from(sig, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (
      a.length === 0 ||
      a.length !== b.length ||
      !timingSafeEqual(a, b)
    ) {
      return { ok: false, reason: "sig" };
    }
  } catch {
    return { ok: false, reason: "sig" };
  }
  try {
    const payload = Buffer.from(body, "base64url").toString("utf8");
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "decode" };
  }
}

/** Cookie de sessão: rawToken|expUnix|status assinado */
export function packSessionCookie(rawToken: string, expiresAt: Date, status?: string): string {
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const payload = `${rawToken}|${exp}|${status ?? ""}`;
  return signPayload(payload);
}

export function unpackSessionCookie(
  cookieValue: string
): { ok: true; token: string; exp: number } | { ok: false; reason: string } {
  const v = verifySignedPayload(cookieValue);
  if (!v.ok) return v;
  const [token, expStr] = v.payload.split("|");
  const exp = Number(expStr);
  if (!token || !Number.isFinite(exp)) return { ok: false, reason: "payload" };
  if (exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, token, exp };
}

/** Challenge 2FA: userId|exp (userId sempre no formato "usr_<base64url>" sem "|") */
export function create2faChallenge(userId: string, ttlSec = 300): string {
  // Defesa em profundidade: userIds válidos não contêm "|", mas se por algum
  // motivo entrarem, o split abaixo na verificação daria parsing errado.
  // Codificamos para base64url para garantir parsing inequívoco.
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const safeUser = Buffer.from(userId, "utf8").toString("base64url");
  return signPayload(`${safeUser}|${exp}`);
}

export function verify2faChallenge(
  challenge: string
): { ok: true; userId: string } | { ok: false; reason: string } {
  const v = verifySignedPayload(challenge);
  if (!v.ok) return v;
  const [safeUser, expStr] = v.payload.split("|");
  const exp = Number(expStr);
  if (!safeUser || !Number.isFinite(exp)) return { ok: false, reason: "payload" };
  if (exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
  let userId: string;
  try {
    userId = Buffer.from(safeUser, "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "payload" };
  }
  if (!userId) return { ok: false, reason: "payload" };
  return { ok: true, userId };
}
