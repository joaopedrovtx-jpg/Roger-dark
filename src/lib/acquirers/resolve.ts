/**
 * Resolve qual adquirente usar para cobrança/saque.
 *
 * Fonte da verdade no painel: **ordem de prioridade** (#1 = principal).
 * isPrimary é espelho do #1 (sincronizado ao mudar setas / setPrimary).
 *
 * Ordem de escolha:
 * 1) enabled + ativo + com privateKey, ordenado por priority ASC
 * 2) preferência isPrimary se houver empate
 * 3) fallback env (.env)
 */

export type AcquirerProvider = "podpay" | "velana" | "woovi";

export interface ResolvedAcquirer {
  provider: AcquirerProvider;
  id: string;
  code: string;
  isPrimary: boolean;
  priority: number;
  hasKey: boolean;
}

function detectProvider(a: {
  id: string;
  code: string;
  privateKey?: string | null;
  publicKey?: string | null;
}): AcquirerProvider | null {
  const code = (a.code || "").toUpperCase();
  const id = (a.id || "").toLowerCase();
  const key = (a.privateKey || a.publicKey || "").trim();

  // Código/id mandam — nunca classificar por prefixo de key genérico
  if (code === "VELANA" || id === "velana") return "velana";
  if (code === "PODPAY" || id === "podpay") return "podpay";
  if (
    code === "WOOVI" ||
    code === "OPENPIX" ||
    id === "woovi" ||
    id === "openpix"
  ) {
    return "woovi";
  }

  // Legado: chave PodPay em adquirente genérica
  if (key && (key.startsWith("sk_live") || key.startsWith("sk_test"))) {
    return "podpay";
  }

  return null;
}

export type SellerRouteResult = ResolvedAcquirer & {
  /** plataforma = principal global · personalizado = só este seller */
  routingMode: "plataforma" | "personalizado";
};

/**
 * Rota do seller (cobrança E saque):
 * - routingMode=personalizado + preferredAdquirenteId → SEMPRE essa adquirente
 *   (Velana / PodPay / Woovi da conta do usuário — não mistura).
 * - preferredAdquirenteId preenchido mesmo sem flag → trata como personalizado
 * - user_acquirers com 1 link enabled → usa essa
 * - caso contrário → #1 da plataforma.
 */
export async function resolveAcquirerForSeller(
  sellerId: string
): Promise<SellerRouteResult | null> {
  try {
    const { prisma, isDatabaseConfigured } = await import(
      "@/lib/server/prisma"
    );
    if (!isDatabaseConfigured() || !sellerId) {
      const g = await resolveActiveAcquirer();
      return g ? { ...g, routingMode: "plataforma" } : null;
    }
    const user = await prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        routingMode: true,
        preferredAdquirenteId: true,
      },
    });

    const prefRaw = user?.preferredAdquirenteId?.trim() || "";

    // 1) Preferência explícita do seller (personalizado)
    if (
      (user?.routingMode === "personalizado" || !!prefRaw) &&
      prefRaw
    ) {
      const pref = prefRaw;
      const a = await prisma.acquirer.findFirst({
        where: {
          OR: [
            { id: pref },
            { code: pref },
            { code: pref.toUpperCase() },
            { code: pref.toLowerCase() },
          ],
        },
      });
      if (a) {
        const key = (a.privateKey || a.publicKey || "").trim();
        const provider = detectProvider(a);
        if (provider) {
          return {
            provider,
            id: a.id,
            code: a.code,
            isPrimary: false,
            priority: a.priority,
            hasKey: !!key,
            routingMode: "personalizado",
          };
        }
      }
      const low = pref.toLowerCase();
      const providerGuess: AcquirerProvider | null =
        low === "podpay" || low.includes("pod")
          ? "podpay"
          : low === "velana" || low.includes("vel")
            ? "velana"
            : low === "woovi" || low.includes("openpix") || low.includes("woov")
              ? "woovi"
              : null;
      if (providerGuess) {
        return {
          provider: providerGuess,
          id: pref,
          code: providerGuess.toUpperCase(),
          isPrimary: false,
          priority: 0,
          hasKey: false,
          routingMode: "personalizado",
        };
      }
    }

    // 2) Link user_acquirers (uma adquirente ativa no seller)
    try {
      const links = await prisma.userAcquirer.findMany({
        where: { userId: sellerId, enabled: true },
        include: { acquirer: true },
        take: 5,
      });
      if (links.length === 1 && links[0].acquirer) {
        const a = links[0].acquirer;
        const provider = detectProvider(a);
        if (provider) {
          return {
            provider,
            id: a.id,
            code: a.code,
            isPrimary: false,
            priority: a.priority,
            hasKey: !!(a.privateKey || a.publicKey || "").trim(),
            routingMode: "personalizado",
          };
        }
      }
    } catch {
      /* tabela pode não ter relação em mock */
    }
  } catch {
    /* fall through */
  }
  const g = await resolveActiveAcquirer();
  return g ? { ...g, routingMode: "plataforma" } : null;
}

/**
 * Adquirente exclusiva de SAQUE (PIX out / white).
 * Quando configurada em Admin → Adquirentes → Saque, TODO saque
 * (manual, automático, admin aprovar) sai por ela — não pela rota
 * de cobrança do seller.
 *
 * Fallback: principal de cobrança (#1) se nenhuma payout primary.
 */
export async function resolveAcquirerForPayout(): Promise<ResolvedAcquirer | null> {
  try {
    const { prisma, isDatabaseConfigured } = await import(
      "@/lib/server/prisma"
    );
    if (isDatabaseConfigured()) {
      // Preferência: isPayoutPrimary (coluna nova). Se o client Prisma
      // ainda não tiver o campo, o findMany com select falha e caímos
      // no fallback raw / active.
      try {
        const payout = await prisma.acquirer.findFirst({
          where: {
            isPayoutPrimary: true,
            enabled: true,
            status: "ativo",
          },
          orderBy: [{ priority: "asc" }],
        });
        if (payout) {
          const provider = detectProvider(payout);
          if (provider) {
            const key = (payout.privateKey || payout.publicKey || "").trim();
            return {
              provider,
              id: payout.id,
              code: payout.code,
              isPrimary: true,
              priority: payout.priority,
              hasKey: !!key,
            };
          }
        }
      } catch {
        // Coluna ainda não existe / client desatualizado → raw SQL
        try {
          const rows = await prisma.$queryRaw<
            Array<{
              id: string;
              code: string;
              privateKey: string | null;
              publicKey: string | null;
              priority: number;
              isPrimary: number | boolean;
            }>
          >`SELECT id, code, privateKey, publicKey, priority, isPrimary
             FROM acquirers
             WHERE isPayoutPrimary = 1 AND enabled = 1 AND status = 'ativo'
             ORDER BY priority ASC
             LIMIT 1`;
          const row = rows?.[0];
          if (row) {
            const provider = detectProvider(row);
            if (provider) {
              const key = (row.privateKey || row.publicKey || "").trim();
              return {
                provider,
                id: row.id,
                code: row.code,
                isPrimary: true,
                priority: Number(row.priority) || 1,
                hasKey: !!key,
              };
            }
          }
        } catch {
          /* sem coluna ainda */
        }
      }
    }
  } catch {
    /* fall through */
  }
  // Sem white de saque configurada → mesma rota de cobrança da plataforma
  return resolveActiveAcquirer();
}

/**
 * Escolhe a adquirente #1 da fila com credenciais.
 * Se a #1 não tem chave, tenta a próxima da ordem (fallback de rota).
 */
export async function resolveActiveAcquirer(): Promise<ResolvedAcquirer | null> {
  try {
    const { prisma, isDatabaseConfigured } = await import(
      "@/lib/server/prisma"
    );
    if (isDatabaseConfigured()) {
      const rows = await prisma.acquirer.findMany({
        where: {
          enabled: true,
          status: "ativo",
        },
        // #1 do painel (priority ASC) manda isPrimary só desempate
        orderBy: [{ priority: "asc" }, { isPrimary: "desc" }],
        take: 30,
      });

      // 1) Primeiro com chave na ordem da fila
      for (const a of rows) {
        const key = (a.privateKey || "").trim();
        if (!key) continue;
        const provider = detectProvider(a);
        if (!provider) continue;
        return {
          provider,
          id: a.id,
          code: a.code,
          isPrimary: a.isPrimary || a.priority === 1,
          priority: a.priority,
          hasKey: true,
        };
      }

      // 2) #1 da fila mesmo sem chave (caller trata erro de config)
      if (rows[0]) {
        const provider = detectProvider(rows[0]);
        if (provider) {
          return {
            provider,
            id: rows[0].id,
            code: rows[0].code,
            isPrimary: true,
            priority: rows[0].priority,
            hasKey: !!(rows[0].privateKey || "").trim(),
          };
        }
      }
    }
  } catch {
    /* DB offline */
  }

  // Fallback env — se só uma adquirente no env, usa ela
  const hasVelanaEnv = !!(
    process.env.VELANA_SECRET_KEY ||
    process.env.VELANA_API_KEY ||
    process.env.VELANA_PRIVATE_KEY
  );
  const hasPodPayEnv = !!(
    process.env.PODPAY_API_KEY || process.env.PODPAY_SECRET_KEY
  );
  const hasWooviEnv = !!(
    process.env.WOOVI_APP_ID ||
    process.env.WOOVI_API_KEY ||
    process.env.OPENPIX_APP_ID
  );

  const envProviders = [
    hasPodPayEnv && ("podpay" as const),
    hasVelanaEnv && ("velana" as const),
    hasWooviEnv && ("woovi" as const),
  ].filter(Boolean) as AcquirerProvider[];

  if (envProviders.length === 1) {
    const p = envProviders[0];
    return {
      provider: p,
      id: p,
      code: p.toUpperCase(),
      isPrimary: true,
      priority: 1,
      hasKey: true,
    };
  }

  return null;
}
