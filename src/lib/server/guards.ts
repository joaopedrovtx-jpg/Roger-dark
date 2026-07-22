/**
 * Guards de API sessão (cookie ou Bearer) + API key do seller + papel admin.
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
 *
 * IMPORTANTE: se vier Bearer sk_*, a conta da API key manda NÃO a sessão admin.
 * Assim a rota personalizada do seller (PodPay/Velana) é a do dono da sk_.
 */
/**
 * Conta seller precisa estar ativa para operar o gateway (pagamentos, saques, API).
 * Admin em sessão de painel não é bloqueado por status pendente do próprio user.
 */
export function accountNotActiveResponse(user: AuthUser): GuardFail | null {
  if (user.roles.includes("admin")) return null;
  if (user.status === "ativo") return null;
  if (user.status === "bloqueado") {
    return {
      error: NextResponse.json(
        { error: "Conta bloqueada", code: "account_blocked" },
        { status: 403 }
      ),
    };
  }
  return {
    error: NextResponse.json(
      {
        error:
          "Conta pendente de aprovação. Envie os documentos e aguarde a liberação do gateway.",
        code: "account_pending",
        hint: "Acesse Configurações → Meus documentos (RG frente/verso, selfie e contrato social).",
        setupPath: "/configuracoes/documentos",
      },
      { status: 403 }
    ),
  };
}

function requestHasApiKey(req: Request): boolean {
  const authHdr =
    req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (authHdr.toLowerCase().startsWith("bearer ")) {
    const t = authHdr.slice(7).trim();
    if (t.startsWith("sk_")) return true;
  }
  if (authHdr.toLowerCase().startsWith("basic ")) return true;
  const xSecret =
    req.headers.get("x-secret-key") ||
    req.headers.get("x-api-key") ||
    req.headers.get("x-darkpay-secret");
  if (xSecret?.trim().startsWith("sk_")) return true;
  return false;
}

export async function requireSellerAuth(
  req: Request,
  opts?: { permission?: ApiPermission }
): Promise<GuardOk | GuardFail> {
  // ── 1) API key: Bearer sk_ · x-secret-key · x-public-key (estilo VizzionPay)
  // Mesmo com cookie de admin: cobrança usa o seller dono da sk_ e a rota dele.
  if (requestHasApiKey(req)) {
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
      const blocked = accountNotActiveResponse(u);
      if (blocked) return blocked;
      return { user: u, apiAuth, authVia: "api_key" };
    }
    const failure = detailed.failure || "invalid";
    return {
      error: NextResponse.json(
        {
          error: messageForApiKeyFailure(failure),
          code: `api_key_${failure}`,
          hint:
            "Use headers x-public-key + x-secret-key (ou Authorization: Bearer sk_…). " +
            "A secret completa está em Integrações → API (copiar).",
        },
        { status: 401 }
      ),
    };
  }

  // ── 2) Sessão cookie (painel / playground sem sk_) ───────────────────
  const csrf = csrfGuard(req);
  if (csrf) return csrf;

  const sessionToken = extractTokenFromRequest(req);
  if (sessionToken && !sessionToken.startsWith("sk_")) {
    const user = await getUserBySessionToken(sessionToken);
    if (user) {
      const blocked = accountNotActiveResponse(user);
      if (blocked) return blocked;
      return { user, authVia: "session" };
    }
  }

  const cookieUser = await getSessionUser(req);
  if (cookieUser) {
    const blocked = accountNotActiveResponse(cookieUser);
    if (blocked) return blocked;
    return { user: cookieUser, authVia: "session" };
  }

  return {
    error: NextResponse.json(
      {
        error: "Não autenticado",
        hint:
          "Use Authorization: Bearer sk_live_… do seller (Integrações → API) ou faça login no painel. " +
          "A rota personalizada (PodPay/Velana) é sempre a da conta autenticada.",
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

/**
 * Painel Admin: super-admin (role admin) ou gerente (role manager).
 * Use requireStaffPermission para restringir por página.
 */
export async function requireAdmin(
  req?: Request
): Promise<GuardOk | GuardFail> {
  const r = await requireAuth(req);
  if ("error" in r) return r;

  const { rolesIncludeStaff } = await import("@/lib/staff").catch(
    () => ({ rolesIncludeStaff: () => false } as unknown as typeof import("@/lib/staff"))
  );
  if (!rolesIncludeStaff(r.user.roles)) {
    return {
      error: NextResponse.json(
        { error: "Acesso restrito a administradores e gerentes" },
        { status: 403 }
      ),
    };
  }

  // Policy: super-admin sem 2FA (quando exigido)
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

/** Exige staff + permissão (gerentes limitados; super-admin passa). */
export async function requireStaffPermission(
  req: Request | undefined,
  permission: import("@/lib/staff").StaffPermission
): Promise<GuardOk | GuardFail> {
  const r = await requireAdmin(req);
  if ("error" in r) return r;
  const { hasStaffPermission } = await import("@/lib/staff");
  if (!hasStaffPermission(r.user, permission)) {
    return {
      error: NextResponse.json(
        {
          error: "Sem permissão para este recurso",
          code: "forbidden_permission",
          required: permission,
        },
        { status: 403 }
      ),
    };
  }
  return r;
}

export function isGuardFail(
  r: GuardOk | GuardFail | SellerScope | { error?: NextResponse }
): r is GuardFail {
  return (
    typeof r === "object" &&
    r !== null &&
    "error" in r &&
    (r as GuardFail).error instanceof NextResponse
  );
}

/** Header enviado pelo painel ao visualizar um seller (prova social). */
export const VIEW_SELLER_HEADER = "x-darkpay-view-seller";

export type SellerScope = {
  /** Id da conta cujos dados serão lidos */
  sellerId: string;
  /** true = staff só visualiza (sem saque / escrita) */
  viewOnly: boolean;
  /** Nome opcional do staff logado */
  actorId: string;
};

/**
 * Resolve o seller alvo de uma rota do painel.
 * - Seller normal → a própria conta
 * - Staff com header X-DarkPay-View-Seller → conta do seller (somente leitura)
 */
export async function resolveSellerScope(
  req: Request,
  gate: GuardOk
): Promise<SellerScope | GuardFail> {
  const raw =
    req.headers.get("x-darkpay-view-seller") ||
    req.headers.get("X-DarkPay-View-Seller") ||
    "";
  const viewId = raw.trim();

  if (!viewId || viewId === gate.user.id) {
    return {
      sellerId: gate.user.id,
      viewOnly: false,
      actorId: gate.user.id,
    };
  }

  const { rolesIncludeStaff } = await import("@/lib/staff");
  if (!rolesIncludeStaff(gate.user.roles)) {
    return {
      error: NextResponse.json(
        {
          error: "Sem permissão para visualizar outra conta",
          code: "forbidden_view_seller",
        },
        { status: 403 }
      ),
    };
  }

  // Confere se o usuário existe e não é outro super-admin
  if (isDatabaseConfigured()) {
    try {
      const target = await prisma.user.findUnique({
        where: { id: viewId },
        select: { id: true, roles: true, status: true },
      });
      if (!target) {
        return {
          error: NextResponse.json(
            { error: "Usuário não encontrado", code: "seller_not_found" },
            { status: 404 }
          ),
        };
      }
      let roles: string[] = [];
      try {
        const r = target.roles as unknown;
        const arr = Array.isArray(r)
          ? r
          : typeof r === "string"
            ? JSON.parse(r)
            : [];
        if (Array.isArray(arr)) roles = arr.map((x) => String(x).toLowerCase());
      } catch {
        /* ignore */
      }
      if (roles.includes("admin")) {
        return {
          error: NextResponse.json(
            {
              error: "Não é possível visualizar conta de super-admin",
              code: "forbidden_view_admin",
            },
            { status: 403 }
          ),
        };
      }
    } catch {
      /* se DB falhar, ainda permite com o id (dev) */
    }
  }

  return {
    sellerId: viewId,
    viewOnly: true,
    actorId: gate.user.id,
  };
}

/** Bloqueia escrita (ex.: saque) quando staff está só visualizando. */
export function viewOnlyForbidden(): GuardFail {
  return {
    error: NextResponse.json(
      {
        error:
          "Modo visualização: não é permitido realizar saques ou ações na conta do seller.",
        code: "view_only",
      },
      { status: 403 }
    ),
  };
}
