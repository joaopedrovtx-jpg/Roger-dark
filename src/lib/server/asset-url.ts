/**
 * Validador de URL para assets do painel (logo, favicon, banners).
 * - Aceita data: e https:
 * - Bloqueia http://, file:, javascript:, data: que não seja image/*
 * - Bloqueia IPs privados/link-local/loopback (mitiga SSRF latente)
 */
export type UrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

const ALLOWED_DATA_PREFIXES = ["data:image/"];

function isPrivateOrLoopback(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) {
    return true;
  }
  // IPv4
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [, a, b] = m.map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
  }
  // IPv6 loopback e privados
  if (h === "::1" || h === "[::1]") return true;
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

export function validateAssetUrl(raw: unknown): UrlValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "URL inválida (não é string)" };
  }
  const url = raw.trim();
  if (!url) return { ok: false, reason: "URL vazia" };
  if (url.length > 2_000) {
    return { ok: false, reason: "URL muito longa" };
  }

  // data: permitido APENAS para image/*
  if (url.startsWith("data:")) {
    if (ALLOWED_DATA_PREFIXES.some((p) => url.toLowerCase().startsWith(p))) {
      return { ok: true, url };
    }
    return { ok: false, reason: "data: permitido apenas para imagens" };
  }

  // javascript: / vbscript: / file: / blob:
  if (/^(javascript|vbscript|file|blob|about):/i.test(url)) {
    return { ok: false, reason: "Esquema não permitido" };
  }

  // Apenas https: para URLs remotas
  if (!/^https:\/\//i.test(url)) {
    return { ok: false, reason: "Apenas https:// (ou data:image/) é permitido" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "URL malformada" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "Apenas https: permitido" };
  }
  if (!parsed.hostname) {
    return { ok: false, reason: "Hostname ausente" };
  }
  if (isPrivateOrLoopback(parsed.hostname)) {
    return { ok: false, reason: "Hosts privados / loopback bloqueados" };
  }
  return { ok: true, url };
}
