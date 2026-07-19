"use server";

import { getSessionUser } from "@/lib/server/auth";
import { dbUpdateManagerStatus } from "@/lib/server/db/admin-managers.service";

export async function updateManagerStatusAction(
  id: string,
  status: "ativo" | "inativo"
) {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado" };
  if (!user.roles.includes("admin")) return { error: "Acesso restrito a administradores" };
  if (status !== "ativo" && status !== "inativo") {
    return { error: "status inválido" };
  }

  try {
    const r = await dbUpdateManagerStatus(id, status);
    return { id, status, source: r ? "mysql" : "mock" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
}
