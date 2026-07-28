"use server";

import { cookies } from "next/headers";
import {
  logoutByToken,
  getSessionUser,
  SESSION_COOKIE_NAME,
} from "@/lib/server/auth";

/**
 * DESABILITADO: server actions de login/registro pulavam 2FA, rate-limit
 * e Turnstile. Use POST /api/v1/auth/login (+ /login/2fa) e /register.
 * Mantidos só para não quebrar imports legados — nunca criam sessão.
 */
export async function loginAction(_formData?: FormData) {
  return {
    error:
      "Login via server action desabilitado. Use POST /api/v1/auth/login (com 2FA).",
    code: "use_api_login",
  };
}

export async function registerAction(_formData?: FormData) {
  return {
    error:
      "Cadastro via server action desabilitado. Use POST /api/v1/auth/register.",
    code: "use_api_register",
  };
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  await logoutByToken(token);
  // Espelha as flags do cookie original pra sobrescrever de fato
  // (sem secure, o browser ignora maxAge=0 quando o cookie foi setado Secure).
  const isHttps =
    process.env.NODE_ENV === "production" ||
    process.env.COOKIE_SECURE === "1" ||
    process.env.COOKIE_SECURE === "true" ||
    !!process.env.VERCEL;
  jar.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isHttps,
    maxAge: 0,
  });
  return { ok: true };
}

export async function getMeAction() {
  try {
    const user = await getSessionUser();
    if (!user) return { error: "Não autenticado" };
    return { user };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}
