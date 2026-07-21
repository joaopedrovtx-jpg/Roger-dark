"use server";

import { cookies } from "next/headers";
import {
  loginWithPassword,
  registerWithPassword,
  logoutByToken,
  getSessionUser,
  createSessionForUser,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/server/auth";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email?.trim() || !password) {
    return { error: "E-mail e senha são obrigatórios." };
  }

  try {
    const session = await loginWithPassword(
      { email, password },
      { ip: "server-action", userAgent: "server-action" }
    );
    const jar = await cookies();
    const cookie = sessionCookieOptions(session.token);
    jar.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      path: cookie.path,
      secure: cookie.secure,
      maxAge: cookie.maxAge,
    });
    return { user: session.user, expiresAt: session.expiresAt };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no login" };
  }
}

export async function registerAction(formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  const password = formData.get("password") as string;

  if (!name?.trim() || !email?.trim() || !password) {
    return { error: "Nome, e-mail e senha são obrigatórios." };
  }

  try {
    const session = await registerWithPassword(
      { name, email, phone: phone ?? "", password },
      { ip: "server-action", userAgent: "server-action" }
    );
    const jar = await cookies();
    const cookie = sessionCookieOptions(session.token);
    jar.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      path: cookie.path,
      secure: cookie.secure,
      maxAge: cookie.maxAge,
    });
    return { user: session.user, expiresAt: session.expiresAt };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha no cadastro" };
  }
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  await logoutByToken(token);
  // Espelha as flags do cookie original pra sobrescrever de fato
  // (sem secure, o browser ignora maxAge=0 quando o cookie foi setado Secure).
  const isHttps =
    process.env.COOKIE_SECURE === "1" || !!process.env.VERCEL;
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
