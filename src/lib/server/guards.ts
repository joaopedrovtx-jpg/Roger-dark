/**
 * Guards de API — sessão (cookie ou Bearer) + API key do seller + papel admin.
 */
import { NextResponse } from "next/server";
import {
  extractTokenFromRequest,
  getSessionUser,
  getUserBySessionToken,
} from "@/lib/server/auth";
import type { AuthUser } from "@/lib/domain/types";
import {
  authenticateApiKey,
  hasPermission,
  type ApiCredentialAuth,
  type ApiPermission,
} from "@/lib/server/db/api-credentials.service";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

export type GuardOk = {
  user: AuthUser;
  /** presente quando autenticou com sk_ da Integrações → API */
  apiAuth?: ApiCredentialAuth;
  authVia: "session" | "api_key";
};
export type GuardFail = { error: NextResponse };

export async function requireAuth(
  req?: Request
): Promise<GuardOk | GuardFail> {
  const user = await getSessionUser(req ?? null);
  if (!user) {
    return {
      error: NextResponse.json(
        {
          error: "Não autenticado",
          hint: "Faça login novamente. Se persistir, confira se o MySQL está no ar (npm run db:up && npm run db:seed).",
        },
        { status: 401 }
      ),
    };
  }
  return { user, authVia: "session" };
}

/**
 * Sessão do painel OU chave de API do seller (Bearer sk_live_/sk_test_).
 * Usado em /api/v1/payments e demais endpoints de integração externa.
 */
export async function requireSellerAuth(
  req: Request,
  opts?: { permission?: ApiPermission }
): Promise<GuardOk | GuardFail> {
  // 1) sessão (painel / playground)
  const sessionToken = extractTokenFromRequest(req);
  if (sessionToken && !sessionToken.startsWith("sk_")) {
    const user = await getUserBySessionToken(sessionToken);
    if (user) {
      return { user, authVia: "session" };
    }
  }
  // cookie sem bearer
  const cookieUser = await getSessionUser(req);
  if (cookieUser) {
    // se também mandou sk_, preferir API key para lastUsedAt
    const apiAuth = await authenticateApiKey(req);
    if (apiAuth) {
      const u = await loadUser(apiAuth.userId);
      if (u) {
        if (opts?.permission && !hasPermission(apiAuth, opts.permission)) {
          return {
            error: NextResponse.json(
              {
                error: "Permissão insuficiente nesta credencial de API",
                required: opts.permission,
              },
              { status: 403 }
            ),
          };
        }
        return { user: u, apiAuth, authVia: "api_key" };
      }
    }
    return { user: cookieUser, authVia: "session" };
  }

  // 2) API key (cassino / checkout / backend do seller)
  const apiAuth = await authenticateApiKey(req);
  if (apiAuth) {
    if (opts?.permission && !hasPermission(apiAuth, opts.permission)) {
      return {
        error: NextResponse.json(
          {
            error: "Permissão insuficiente nesta credencial de API",
            required: opts.permission,
            hint: "Em Integrações → API, edite a credencial e marque a permissão necessária.",
          },
          { status: 403 }
        ),
      };
    }
    const u = await loadUser(apiAuth.userId);
    if (!u) {
      return {
        error: NextResponse.json(
          { error: "Usuário da credencial não encontrado" },
          { status: 401 }
        ),
      };
    }
    if (u.status === "bloqueado") {
      return {
        error: NextResponse.json({ error: "Conta bloqueada" }, { status: 403 }),
      };
    }
    return { user: u, apiAuth, authVia: "api_key" };
  }

  return {
    error: NextResponse.json(
      {
        error: "Não autenticado",
        hint:
          "Use Authorization: Bearer sk_live_… (ou sk_test_…) gerada em Integrações → API, ou faça login no painel.",
      },
      { status: 401 }
    ),
  };
}

async function loadUser(userId: string): Promise<AuthUser | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (!u) return null;
    let roles: AuthUser["roles"] = ["seller"];
    try {
      const raw = u.roles as unknown;
      const arr = Array.isArray(raw)
        ? raw
        : typeof raw === "string"
          ? JSON.parse(raw)
          : [];
      if (Array.isArray(arr) && arr.length) {
        roles = arr
          .map((r) => String(r).toLowerCase())
          .filter(
            (r): r is AuthUser["roles"][number] =>
              r === "seller" || r === "admin" || r === "manager"
          );
      }
    } catch {
      /* default seller */
    }
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status as AuthUser["status"],
      roles: roles.length ? roles : ["seller"],
      avatarUrl: u.avatarUrl ?? null,
      displayName: u.displayName ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function requireAdmin(
  req?: Request
): Promise<GuardOk | GuardFail> {
  const r = await requireAuth(req);
  if ("error" in r) return r;
  if (!r.user.roles.includes("admin")) {
    return {
      error: NextResponse.json(
        { error: "Acesso restrito a administradores" },
        { status: 403 }
      ),
    };
  }
  return r;
}

export function isGuardFail(r: GuardOk | GuardFail): r is GuardFail {
  return "error" in r;
}
