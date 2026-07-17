/**
 * Tokens assinados (HMAC) para middleware / challenges sem DB no Edge.
 */
import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  const s =
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "";
  if (s.length >= 16) return s;
  // Dev fallback (nunca em prod real sem SESSION_SECRET)
  return "darkpay-dev-session-secret-min-16";
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
  const expected = createHmac("sha256", secret())
    .update(body)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
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

/** Cookie de sessão: rawToken.expUnix.sig  (middleware valida exp+sig; API valida rawToken no DB) */
export function packSessionCookie(rawToken: string, expiresAt: Date): string {
  const exp = Math.floor(expiresAt.getTime() / 1000);
  const payload = `${rawToken}|${exp}`;
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

/** Challenge 2FA: userId|exp */
export function create2faChallenge(userId: string, ttlSec = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return signPayload(`${userId}|${exp}`);
}

export function verify2faChallenge(
  challenge: string
): { ok: true; userId: string } | { ok: false; reason: string } {
  const v = verifySignedPayload(challenge);
  if (!v.ok) return v;
  const [userId, expStr] = v.payload.split("|");
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp)) return { ok: false, reason: "payload" };
  if (exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, userId };
}
