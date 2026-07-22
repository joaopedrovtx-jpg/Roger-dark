const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string
): Promise<{ success: boolean; error?: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  // Sem secret no .env: não bloqueia login (dev / antes de configurar CF).
  // Com secret: token obrigatório e validado no siteverify.
  if (!secret) {
    return { success: true };
  }

  if (!token || typeof token !== "string" || token.length > 2048) {
    return { success: false, error: "Token inválido" };
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: remoteIp,
      }),
    });

    const data = await res.json();
    if (data.success !== true) {
      const codes: string[] = data["error-codes"] ?? [];
      return { success: false, error: codes.join(", ") };
    }

    return { success: true };
  } catch {
    return { success: false, error: "Falha na verificação Turnstile" };
  }
}
