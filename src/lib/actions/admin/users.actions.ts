"use server";

import { getSessionUser } from "@/lib/server/auth";
import type { SellerFees } from "@/lib/domain/types";
import {
  dbUpdateUserStatus,
  dbUpdateUserFees,
  dbUpdateUserRouting,
  dbSetUserDocumentsStatus,
} from "@/lib/server/db/admin-users.service";
import type { UserStatus, DocReviewStatus } from "@/lib/domain/types";

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado" };
  if (!user.roles.includes("admin")) return { error: "Acesso restrito a administradores" };
  return { user };
}

export async function updateUserStatusAction(userId: string, status: UserStatus) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    const r = await dbUpdateUserStatus(userId, status);
    if (!r) return { id: userId, status, source: "mock" };
    return { ...r, source: "mysql" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function updateUserFeesAction(userId: string, fees: SellerFees) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    const r = await dbUpdateUserFees(userId, fees);
    if (!r) return { id: userId, fees, source: "mock" };
    return { ...r, source: "mysql" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function updateUserRoutingAction(
  userId: string,
  data: {
    saqueAutomatico?: boolean;
    routingMode?: string;
    preferredAdquirenteId?: string | null;
    adquirenteIds?: string[];
  }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    const r = await dbUpdateUserRouting(userId, data);
    if (!r) return { id: userId, source: "mock", ...data };
    return { ...r, source: "mysql" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}

export async function setDocumentsStatusAction(
  userId: string,
  status: DocReviewStatus
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  try {
    const r = await dbSetUserDocumentsStatus(userId, status);
    if (!r) return { ok: true, source: "mock" };
    return { ...r, source: "mysql" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}
