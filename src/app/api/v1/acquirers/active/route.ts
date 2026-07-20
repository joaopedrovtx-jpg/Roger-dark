import { NextResponse } from "next/server";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import {
  resolveAcquirerForSeller,
  resolveActiveAcquirer,
} from "@/lib/acquirers/resolve";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

function maskSecret(key: string): string {
  const k = key.trim();
  if (!k) return "";
  if (k.length <= 10) return "••••••••";
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}

/**
 * GET /api/v1/acquirers/active
 * Qual adquirente processa PIX **para a conta logada** (personalizado do seller
 * ou principal da plataforma). Usado no playground de Pagamentos.
 */
export async function GET(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    // Rota do USUÁRIO logado (não só a principal global)
    const forSeller = await resolveAcquirerForSeller(gate.user.id);
    const platform = await resolveActiveAcquirer();

    const list: Array<{
      id: string;
      name: string;
      code: string;
      provider: "podpay" | "velana" | "other";
      configured: boolean;
      isPrimary: boolean;
      priority: number;
      env: string;
      secretHint: string | null;
      publicHint: string | null;
      active: boolean;
    }> = [];

    if (isDatabaseConfigured()) {
      const rows = await prisma.acquirer.findMany({
        where: {
          OR: [
            { id: { in: ["podpay", "velana"] } },
            { code: { in: ["PODPAY", "VELANA"] } },
          ],
        },
        orderBy: [{ priority: "asc" }, { isPrimary: "desc" }],
      });

      for (const a of rows) {
        const code = (a.code || "").toUpperCase();
        const id = (a.id || "").toLowerCase();
        const provider: "podpay" | "velana" | "other" =
          code === "VELANA" || id === "velana"
            ? "velana"
            : code === "PODPAY" || id === "podpay"
              ? "podpay"
              : "other";
        const priv = (a.privateKey || "").trim();
        const pub = (a.publicKey || "").trim();
        const isActive =
          !!forSeller &&
          (forSeller.id === a.id ||
            (provider !== "other" && forSeller.provider === provider));

        list.push({
          id: a.id,
          name: a.name,
          code: a.code,
          provider,
          configured: !!priv,
          isPrimary: a.isPrimary || a.priority === 1,
          priority: a.priority,
          env: a.env || "live",
          secretHint: priv ? maskSecret(priv) : null,
          publicHint: pub ? maskSecret(pub) : null,
          active: isActive,
        });
      }
    }

    const current = list.find((x) => x.active) || null;

    // Dados de roteamento do user
    let userRouting: {
      routingMode: string;
      preferredAdquirenteId: string | null;
    } | null = null;
    if (isDatabaseConfigured()) {
      const u = await prisma.user.findUnique({
        where: { id: gate.user.id },
        select: { routingMode: true, preferredAdquirenteId: true },
      });
      if (u) {
        userRouting = {
          routingMode: u.routingMode,
          preferredAdquirenteId: u.preferredAdquirenteId,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      sellerId: gate.user.id,
      sellerEmail: gate.user.email,
      routingMode: forSeller?.routingMode ?? userRouting?.routingMode ?? "plataforma",
      preferredAdquirenteId: userRouting?.preferredAdquirenteId ?? null,
      platformPrimary: platform
        ? { id: platform.id, provider: platform.provider, code: platform.code }
        : null,
      active: current
        ? {
            id: current.id,
            name: current.name,
            code: current.code,
            provider: current.provider,
            env: current.env,
            secretHint: current.secretHint,
            publicHint: current.publicHint,
            isPrimary: current.isPrimary,
            routingMode: forSeller?.routingMode ?? "plataforma",
          }
        : forSeller
          ? {
              id: forSeller.id,
              name: forSeller.code,
              code: forSeller.code,
              provider: forSeller.provider,
              env: "live",
              secretHint: null,
              publicHint: null,
              isPrimary: forSeller.isPrimary,
              routingMode: forSeller.routingMode,
            }
          : null,
      items: list,
      hint:
        forSeller?.routingMode === "personalizado"
          ? `Esta conta usa rota PERSONALIZADA → ${forSeller.provider}. Cobranças com a sk_ desta conta vão por ela.`
          : `Esta conta usa a principal da plataforma → ${forSeller?.provider || platform?.provider || "-"}. Para forçar outra, Admin → Usuários → este seller → Adquirentes → Ativar → Salvar.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
