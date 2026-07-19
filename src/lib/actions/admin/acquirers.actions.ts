"use server";

import { getSessionUser } from "@/lib/server/auth";
import type { AdquirenteStatus } from "@/lib/domain/types";
import {
  dbUpdateAcquirerStatus,
  dbSwapAcquirerPriority,
  dbSetAcquirerPrimary,
  dbSaveAcquirerCredentials,
  dbClearAcquirerCredentials,
} from "@/lib/server/db/admin-acquirers.service";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado" };
  if (!user.roles.includes("admin")) return { error: "Acesso restrito a administradores" };
  return { user };
}

export async function updateAcquirerStatusAction(
  id: string,
  status: AdquirenteStatus
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    const r = await dbUpdateAcquirerStatus(id, status);
    return { id, status, source: r ? "mysql" : "mock" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function swapAcquirerPriorityAction(id: string, dir: -1 | 1) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    const r = await dbSwapAcquirerPriority(id, dir);
    return { ok: r?.ok ?? true, source: r ? "mysql" : "mock" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function setAcquirerPrimaryAction(id: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    const r = await dbSetAcquirerPrimary(id);
    return { ok: true, source: r ? "database" : "mock", isPrimary: true, priority: 1 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function saveAcquirerCredentialsAction(
  id: string,
  data: { publicKey?: string; privateKey?: string; env?: string; setPrimary?: boolean }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    const r = await dbSaveAcquirerCredentials(id, data);
    if (!r) {
      return { error: "Banco de dados indisponível.", saved: false };
    }
    return {
      id: r.id,
      source: "database",
      saved: true,
      hasPrivateKey: r.hasPrivateKey,
      hasPublicKey: r.hasPublicKey,
      env: r.env,
      isPrimary: r.isPrimary,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function clearAcquirerCredentialsAction(id: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    const r = await dbClearAcquirerCredentials(id);
    return { ok: true, source: r ? "mysql" : "mock" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}
