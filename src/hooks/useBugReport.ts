"use client";

import { useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { reportClientBug } from "@/lib/client/bug-report";

interface BugContext {
  route?: string;
  method?: string;
  meta?: Record<string, unknown>;
}

/**
 * Log de erro do browser anexando contexto do usuário atual (`/api/v1/bugs`).
 */
export function useBugReport() {
  const { user } = useAuth();

  const report = useCallback(
    (input: {
      message: string;
      stack?: string;
      statusCode?: number;
      code?: string;
      route?: string;
      method?: string;
      meta?: Record<string, unknown>;
    }) => {
      const ctx: Record<string, unknown> = {
        userId: user?.id,
        userEmail: user?.email,
        roles: user?.roles,
        ...(input.meta ?? {}),
      };
      reportClientBug({
        message: input.message,
        stack: input.stack,
        route: input.route,
        method: input.method,
        statusCode: input.statusCode,
        code: input.code,
        meta: ctx,
      });
    },
    [user]
  );

  return { report };
}