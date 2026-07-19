"use server";

import { getSessionUser } from "@/lib/server/auth";
import type { SaqueStatus } from "@/lib/domain/types";
import { setWithdrawalStatusAsync } from "@/lib/services/withdrawal.service";

export async function setWithdrawalStatusAction(id: string, status: SaqueStatus) {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado" };
  if (!user.roles.includes("admin")) return { error: "Acesso restrito a administradores" };
  if (status !== "pago" && status !== "recusado") {
    return { error: "status deve ser pago ou recusado" };
  }

  try {
    const w = await setWithdrawalStatusAsync(id, status);
    return { ...w, source: "ok" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}
