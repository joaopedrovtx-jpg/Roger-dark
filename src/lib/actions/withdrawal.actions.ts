"use server";

import { getSessionUser } from "@/lib/server/auth";
import { createWithdrawal } from "@/lib/services/withdrawal.service";

export async function createWithdrawalAction(amount: number, pixKey: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Não autenticado" };

  if (!amount || !pixKey?.trim()) {
    return { error: "amount e pixKey são obrigatórios" };
  }

  try {
    const w = await createWithdrawal(user.id, user.name, {
      amount,
      pixKey: pixKey.trim(),
    });
    return { withdrawal: w };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao solicitar saque" };
  }
}
