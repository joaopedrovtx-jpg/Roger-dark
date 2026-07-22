/**
 * Taxas da conta seller (venda PIX + saque).
 *
 * Venda PIX (plataforma):
 * - até R$ 50,00 (inclusive): R$ 1,00 fixo por transação
 * - acima de R$ 50,00: 3% do valor da venda
 *
 * Saque: User.saquePercent / saqueFixed (Admin → Usuário).
 */

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { roundMoney } from "@/lib/server/security";

/** Faixa PIX: valor limite e taxas */
export const PIX_FEE_THRESHOLD = 50;
export const PIX_FEE_FIXED_UP_TO_THRESHOLD = 1;
export const PIX_FEE_PERCENT_ABOVE_THRESHOLD = 3;

/** Defaults legados / display admin */
export const DEFAULT_MDR_PERCENT = PIX_FEE_PERCENT_ABOVE_THRESHOLD;
export const DEFAULT_MDR_FIXED = PIX_FEE_FIXED_UP_TO_THRESHOLD;
export const DEFAULT_SAQUE_PERCENT = 3;
export const DEFAULT_SAQUE_FIXED = 0;

export type SellerSaleFees = {
  mdrPercent: number;
  mdrFixed: number;
};

export type SellerWithdrawFees = {
  saquePercent: number;
  saqueFixed: number;
};

export type SellerFeePlan = SellerSaleFees & SellerWithdrawFees;

function n(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

/**
 * Interpreta campos de taxa do User (saque + espelho display).
 * 0 é valor válido. Só usa default se o valor for inválido/NaN.
 */
export function parseSellerFeePlan(user: {
  mdrPercent?: unknown;
  mdrFixed?: unknown;
  saquePercent?: unknown;
  saqueFixed?: unknown;
}): SellerFeePlan {
  const mdrP = n(user.mdrPercent);
  const mdrF = n(user.mdrFixed);
  const saqueP = n(user.saquePercent);
  const saqueF = n(user.saqueFixed);

  return {
    mdrPercent: Number.isFinite(mdrP) ? mdrP : DEFAULT_MDR_PERCENT,
    mdrFixed: Number.isFinite(mdrF) ? mdrF : DEFAULT_MDR_FIXED,
    saquePercent: Number.isFinite(saqueP) ? saqueP : DEFAULT_SAQUE_PERCENT,
    saqueFixed: Number.isFinite(saqueF) ? saqueF : DEFAULT_SAQUE_FIXED,
  };
}

/**
 * Taxa de venda PIX em R$ sobre o valor bruto.
 *
 * Regra da plataforma:
 * - amount ≤ 50 → R$ 1,00 fixo
 * - amount > 50 → 3% do valor
 *
 * `fees` é aceito por compatibilidade das call-sites, mas a regra em faixas manda.
 */
export function computeSaleFeeAmount(
  amountReais: number,
  _fees?: Pick<SellerSaleFees, "mdrPercent" | "mdrFixed">
): number {
  const amount = Math.max(0, Number(amountReais) || 0);
  if (amount <= 0) return 0;

  if (amount <= PIX_FEE_THRESHOLD) {
    return roundMoney(PIX_FEE_FIXED_UP_TO_THRESHOLD);
  }
  return roundMoney((amount * PIX_FEE_PERCENT_ABOVE_THRESHOLD) / 100);
}

export function computeSaleNetAmount(
  amountReais: number,
  fees?: Pick<SellerSaleFees, "mdrPercent" | "mdrFixed">
): { fee: number; net: number } {
  const amount = Math.max(0, Number(amountReais) || 0);
  const fee = computeSaleFeeAmount(amount, fees);
  const net = roundMoney(Math.max(0, amount - fee));
  return { fee, net };
}

/** Carrega MDR da conta no banco (espelho; cálculo de venda usa faixas PIX) */
export async function getSellerSaleFees(
  sellerId: string
): Promise<SellerSaleFees> {
  if (!isDatabaseConfigured()) {
    return {
      mdrPercent: DEFAULT_MDR_PERCENT,
      mdrFixed: DEFAULT_MDR_FIXED,
    };
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { mdrPercent: true, mdrFixed: true },
    });
    if (!user) {
      return {
        mdrPercent: DEFAULT_MDR_PERCENT,
        mdrFixed: DEFAULT_MDR_FIXED,
      };
    }
    const plan = parseSellerFeePlan(user);
    return { mdrPercent: plan.mdrPercent, mdrFixed: plan.mdrFixed };
  } catch {
    return {
      mdrPercent: DEFAULT_MDR_PERCENT,
      mdrFixed: DEFAULT_MDR_FIXED,
    };
  }
}

export async function getSellerFeePlan(
  sellerId: string
): Promise<SellerFeePlan> {
  if (!isDatabaseConfigured()) {
    return {
      mdrPercent: DEFAULT_MDR_PERCENT,
      mdrFixed: DEFAULT_MDR_FIXED,
      saquePercent: DEFAULT_SAQUE_PERCENT,
      saqueFixed: DEFAULT_SAQUE_FIXED,
    };
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        mdrPercent: true,
        mdrFixed: true,
        saquePercent: true,
        saqueFixed: true,
      },
    });
    if (!user) {
      return {
        mdrPercent: DEFAULT_MDR_PERCENT,
        mdrFixed: DEFAULT_MDR_FIXED,
        saquePercent: DEFAULT_SAQUE_PERCENT,
        saqueFixed: DEFAULT_SAQUE_FIXED,
      };
    }
    return parseSellerFeePlan(user);
  } catch {
    return {
      mdrPercent: DEFAULT_MDR_PERCENT,
      mdrFixed: DEFAULT_MDR_FIXED,
      saquePercent: DEFAULT_SAQUE_PERCENT,
      saqueFixed: DEFAULT_SAQUE_FIXED,
    };
  }
}
