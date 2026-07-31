"use client";

import { useCallback, useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { GerentePermission } from "@/lib/domain/types";

type StaffPermission = GerentePermission | string;

/**
 * Permissões de painel admin no client (espelho do guard server-side).
 * Super-admin (role `admin`) ignora e tem acesso total.
 */
export function useAdminPermissions() {
  const { user, isAdmin, isSuperAdmin } = useAuth();

  const permissions = useMemo<StaffPermission[]>(
    () => user?.permissions ?? [],
    [user]
  );

  const has = useCallback(
    (perm: StaffPermission) => {
      if (isSuperAdmin) return true;
      if (!isAdmin) return false;
      return permissions.includes(perm);
    },
    [isAdmin, isSuperAdmin, permissions]
  );

  const canAny = useCallback(
    (perms: StaffPermission[]) => perms.some((p) => has(p)),
    [has]
  );

  return {
    permissions,
    isAdmin,
    isSuperAdmin,
    isStaff: isAdmin,
    has,
    canAny,
  };
}