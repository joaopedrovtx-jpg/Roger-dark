/**
 * Resolve qual adquirente usar para cobrança/saque.
 * Ordem: isPrimary com chave → prioridade ASC com chave → env.
 */

export type AcquirerProvider = "podpay" | "velana";

export interface ResolvedAcquirer {
  provider: AcquirerProvider;
  id: string;
  code: string;
  isPrimary: boolean;
  priority: number;
}

function detectProvider(a: {
  id: string;
  code: string;
  privateKey?: string | null;
}): AcquirerProvider | null {
  const code = (a.code || "").toUpperCase();
  const id = (a.id || "").toLowerCase();
  const key = (a.privateKey || "").trim();
  if (!key) return null;

  // Código/id mandam — nunca classificar Velana como PodPay só porque a key começa com sk_
  if (code === "VELANA" || id === "velana") return "velana";
  if (code === "PODPAY" || id === "podpay") return "podpay";

  // Legado: chave PodPay em adquirente genérica
  if (key.startsWith("sk_live") || key.startsWith("sk_test")) return "podpay";

  return null;
}

/**
 * Escolhe a adquirente ativa com credenciais no banco (ou env).
 * Preferência: isPrimary, depois menor priority.
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
          NOT: { privateKey: null },
        },
        orderBy: [{ isPrimary: "desc" }, { priority: "asc" }],
        take: 30,
      });

      for (const a of rows) {
        const provider = detectProvider(a);
        if (!provider) continue;
        return {
          provider,
          id: a.id,
          code: a.code,
          isPrimary: a.isPrimary,
          priority: a.priority,
        };
      }
    }
  } catch {
    /* DB offline */
  }

  // Fallback env (Velana primeiro se ambas)
  if (
    process.env.VELANA_SECRET_KEY ||
    process.env.VELANA_API_KEY ||
    process.env.VELANA_PRIVATE_KEY
  ) {
    return {
      provider: "velana",
      id: "velana",
      code: "VELANA",
      isPrimary: true,
      priority: 1,
    };
  }
  if (process.env.PODPAY_API_KEY || process.env.PODPAY_SECRET_KEY) {
    return {
      provider: "podpay",
      id: "podpay",
      code: "PODPAY",
      isPrimary: true,
      priority: 1,
    };
  }

  return null;
}
