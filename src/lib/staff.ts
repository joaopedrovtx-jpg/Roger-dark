/**
 * Staff do painel Admin: super-admin (role admin) e gerentes (role manager).
 * Gerentes só enxergam páginas liberadas em Manager.permissions.
 */

import type { AuthUser, Role } from "@/lib/domain/types";
import type { GerentePermission } from "@/lib/mock/admin";

export type StaffPermission =
  | GerentePermission
  | "personalizacao";

/** Todas as permissões de um super-admin */
export const ALL_STAFF_PERMISSIONS: StaffPermission[] = [
  "dashboard",
  "usuarios",
  "documentos",
  "saques",
  "adquirentes",
  "gerentes",
  "personalizacao",
];

export function rolesIncludeStaff(roles: Role[] | string[] | unknown): boolean {
  if (!Array.isArray(roles)) return false;
  const r = roles.map((x) => String(x).toLowerCase());
  return r.includes("admin") || r.includes("manager");
}

export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  return !!user?.roles?.includes("admin");
}

export function isStaff(user: AuthUser | null | undefined): boolean {
  return rolesIncludeStaff(user?.roles);
}

export function staffPermissions(user: AuthUser | null | undefined): StaffPermission[] {
  if (!user) return [];
  if (isSuperAdmin(user)) return [...ALL_STAFF_PERMISSIONS];
  const raw = user.permissions ?? [];
  return raw.filter(Boolean) as StaffPermission[];
}

export function hasStaffPermission(
  user: AuthUser | null | undefined,
  perm: StaffPermission
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  if (!user.roles?.includes("manager")) return false;
  return staffPermissions(user).includes(perm);
}

/** Mapa rota admin → permissão necessária */
export const ADMIN_ROUTE_PERMISSION: Array<{
  match: (path: string) => boolean;
  permission: StaffPermission;
}> = [
  { match: (p) => p === "/admin" || p === "/admin/", permission: "dashboard" },
  {
    match: (p) => p.startsWith("/admin/usuarios"),
    permission: "usuarios",
  },
  {
    match: (p) => p.startsWith("/admin/gerentes"),
    permission: "gerentes",
  },
  {
    match: (p) => p.startsWith("/admin/saques"),
    permission: "saques",
  },
  {
    match: (p) => p.startsWith("/admin/adquirentes"),
    permission: "adquirentes",
  },
  {
    match: (p) => p.startsWith("/admin/personalizacao"),
    permission: "personalizacao",
  },
];

export function permissionForAdminPath(pathname: string): StaffPermission | null {
  for (const row of ADMIN_ROUTE_PERMISSION) {
    if (row.match(pathname)) return row.permission;
  }
  return null;
}

/** Primeira rota admin permitida (fallback se sem dashboard) */
export function firstAllowedAdminPath(user: AuthUser): string {
  if (hasStaffPermission(user, "dashboard")) return "/admin";
  if (hasStaffPermission(user, "usuarios")) return "/admin/usuarios";
  if (hasStaffPermission(user, "saques")) return "/admin/saques";
  if (hasStaffPermission(user, "adquirentes")) return "/admin/adquirentes";
  if (hasStaffPermission(user, "gerentes")) return "/admin/gerentes";
  if (hasStaffPermission(user, "personalizacao")) return "/admin/personalizacao";
  return "/admin";
}

export const ADMIN_NAV_PERMISSION: Record<string, StaffPermission> = {
  "/admin": "dashboard",
  "/admin/usuarios": "usuarios",
  "/admin/gerentes": "gerentes",
  "/admin/saques": "saques",
  "/admin/adquirentes": "adquirentes",
  "/admin/personalizacao": "personalizacao",
};
