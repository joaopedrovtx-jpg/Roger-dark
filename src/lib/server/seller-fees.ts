/**
 * Taxas da conta seller (MDR de venda + saque).
 * Fonte: User.mdrPercent / mdrFixed / saquePercent / saqueFixed
 * (editadas no Admin → Usuário → Taxas).
 */

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { roundMoney } from "@/lib/server/security";

/** Defaults de plataforma quando o seller ainda não tem plano personalizado */
export const DEFAULT_MDR_PERCENT = 3;
export const DEFAULT_MDR_FIXED = 0.15;
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
 * Interpreta campos de taxa do User.
 * 0 é valor válido (admin pode zerar). Só usa default se o valor for inválido/NaN.
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

/** Taxa de venda (MDR) em R$ sobre o valor bruto da cobrança */
export function computeSaleFeeAmount(
  amountReais: number,
  fees: Pick<SellerSaleFees, "mdrPercent" | "mdrFixed">
): number {
  const amount = Math.max(0, Number(amountReais) || 0);
  const fee =
    (amount * (Number(fees.mdrPercent) || 0)) / 100 +
    (Number(fees.mdrFixed) || 0);
  return roundMoney(Math.max(0, fee));
}

export function computeSaleNetAmount(
  amountReais: number,
  fees: Pick<SellerSaleFees, "mdrPercent" | "mdrFixed">
): { fee: number; net: number } {
  const amount = Math.max(0, Number(amountReais) || 0);
  const fee = computeSaleFeeAmount(amount, fees);
  const net = roundMoney(Math.max(0, amount - fee));
  return { fee, net };
}

/** Carrega MDR da conta no banco */
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
