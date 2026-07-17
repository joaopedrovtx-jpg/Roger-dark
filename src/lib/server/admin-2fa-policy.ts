/**
 * Policy: admins devem ter 2FA.
 * - Produção: obrigatório por padrão
 * - Dev: só se REQUIRE_ADMIN_2FA=1
 * - Desliga global com REQUIRE_ADMIN_2FA=0
 */

import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import type { Role } from "@/lib/domain/types";

export function isAdmin2faRequired(): boolean {
  const flag = process.env.REQUIRE_ADMIN_2FA?.trim();
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return process.env.NODE_ENV === "production";
}

export function rolesIncludeAdmin(roles: Role[] | string[] | unknown): boolean {
  if (!Array.isArray(roles)) return false;
  return roles.map((r) => String(r).toLowerCase()).includes("admin");
}

export async function userHas2faEnabled(userId: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    const row = await prisma.user2FA.findUnique({
      where: { userId },
      select: { enabled: true },
    });
    return !!row?.enabled;
  } catch {
    return false;
  }
}

/**
 * true se o usuário é admin e a policy exige 2FA e ainda não ativou.
 */
export async function adminMustSetup2fa(
  userId: string,
  roles: Role[] | string[]
): Promise<boolean> {
  if (!isAdmin2faRequired()) return false;
  if (!rolesIncludeAdmin(roles)) return false;
  const enabled = await userHas2faEnabled(userId);
  return !enabled;
}
