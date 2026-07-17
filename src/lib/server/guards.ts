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
  authenticateApiKeyDetailed,
  hasPermission,
  messageForApiKeyFailure,
  type ApiCredentialAuth,
  type ApiPermission,
} from "@/lib/server/db/api-credentials.service";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { validateSessionCsrf } from "@/lib/server/csrf";

export type GuardOk = {
  user: AuthUser;
  /** presente quando autenticou com sk_ da Integrações → API */
  apiAuth?: ApiCredentialAuth;
  authVia: "session" | "api_key";
};
export type GuardFail = { error: NextResponse };

function csrfGuard(req?: Request | null): GuardFail | null {
  if (!req) return null;
  const msg = validateSessionCsrf(req);
  if (!msg) return null;
  return {
    error: NextResponse.json(
      { error: msg, code: "csrf_rejected" },
      { status: 403 }
    ),
  };
}

export async function requireAuth(
  req?: Request
): Promise<GuardOk | GuardFail> {
  const csrf = csrfGuard(req);
  if (csrf) return csrf;

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
    // CSRF só para autenticação por sessão (não API key)
    const csrf = csrfGuard(req);
    if (csrf) return csrf;
    const user = await getUserBySessionToken(sessionToken);
    if (user) {
      return { user, authVia: "session" };
    }
  }
  // cookie / sessão do painel (playground de Pagamentos)
  const cookieUser = await getSessionUser(req);
  if (cookieUser) {
    const csrf = csrfGuard(req);
    if (csrf) return csrf;
    // se mandou sk_ válida, usa API key; se sk_ inválida, CAI NA SESSÃO
    // (antes o playground com credentials:omit + sk_ errada dava “expirada” falso)
    const { auth: apiAuth } = await authenticateApiKeyDetailed(req);
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
    // Sessão válida sempre autentica o playground mesmo com sk_ errada/vazia
    return { user: cookieUser, authVia: "session" };
  }

  // 2) API key pura (cassino / checkout externo — sem cookie)
  const detailed = await authenticateApiKeyDetailed(req);
  if (detailed.auth) {
    const apiAuth = detailed.auth;
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

  // Bearer sk_ presente mas falhou — mensagem específica (não genérica “expirada”)
  const authHdr =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const bearer = authHdr.toLowerCase().startsWith("bearer ")
    ? authHdr.slice(7).trim()
    : "";
  if (bearer.startsWith("sk_") || detailed.failure) {
    const failure =
      detailed.failure ||
      (bearer.includes("…") || bearer.includes("•") || bearer.length < 20
        ? "masked"
        : "invalid");
    return {
      error: NextResponse.json(
        {
          error: messageForApiKeyFailure(failure),
          code: `api_key_${failure}`,
          hint: "A secret completa só aparece ao criar ou rotacionar em Integrações → API.",
        },
        { status: 401 }
      ),
    };
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

  // Policy: admin sem 2FA não acessa painel admin (exceto setup em /auth/2fa)
  try {
    const { adminMustSetup2fa } = await import(
      "@/lib/server/admin-2fa-policy"
    );
    if (await adminMustSetup2fa(r.user.id, r.user.roles)) {
      return {
        error: NextResponse.json(
          {
            error:
              "Administradores devem ativar a verificação em duas etapas (2FA).",
            code: "must_setup_2fa",
            hint: "Vá em Configurações → Segurança e ative o autenticador.",
            setupPath: "/configuracoes/seguranca",
          },
          { status: 403 }
        ),
      };
    }
  } catch {
    /* policy best-effort */
  }

  return r;
}

export function isGuardFail(r: GuardOk | GuardFail): r is GuardFail {
  return "error" in r;
}
