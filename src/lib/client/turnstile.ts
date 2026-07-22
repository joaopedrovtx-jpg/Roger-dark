/**
 * Turnstile só é obrigatório no cliente quando a site key pública está configurada.
 * Sem chave (ex.: VPS sem Cloudflare Turnstile), o widget não renderiza e o login
 * não deve ficar bloqueado com o botão permanentemente disabled.
 */
export function isTurnstileClientEnabled(): boolean {
  const key =
    typeof process !== "undefined"
      ? String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim()
      : "";
  return key.length > 0;
}
