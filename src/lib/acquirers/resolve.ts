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

export type AcquirerProvider = "podpay" | "velana";

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
}): AcquirerProvider | null {
  const code = (a.code || "").toUpperCase();
  const id = (a.id || "").toLowerCase();
  const key = (a.privateKey || "").trim();

  // Código/id mandam — nunca classificar Velana como PodPay só porque a key começa com sk_
  if (code === "VELANA" || id === "velana") return "velana";
  if (code === "PODPAY" || id === "podpay") return "podpay";

  // Legado: chave PodPay em adquirente genérica
  if (key && (key.startsWith("sk_live") || key.startsWith("sk_test"))) {
    return "podpay";
  }

  return null;
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
        // #1 do painel (priority ASC) manda — isPrimary só desempate
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

  // Fallback env — não prefere Velana se só PodPay estiver no env
  const hasVelanaEnv = !!(
    process.env.VELANA_SECRET_KEY ||
    process.env.VELANA_API_KEY ||
    process.env.VELANA_PRIVATE_KEY
  );
  const hasPodPayEnv = !!(
    process.env.PODPAY_API_KEY || process.env.PODPAY_SECRET_KEY
  );

  // Se ambas no env, não assume primária (null → service tenta conforme config)
  if (hasPodPayEnv && !hasVelanaEnv) {
    return {
      provider: "podpay",
      id: "podpay",
      code: "PODPAY",
      isPrimary: true,
      priority: 1,
      hasKey: true,
    };
  }
  if (hasVelanaEnv && !hasPodPayEnv) {
    return {
      provider: "velana",
      id: "velana",
      code: "VELANA",
      isPrimary: true,
      priority: 1,
      hasKey: true,
    };
  }

  return null;
}
