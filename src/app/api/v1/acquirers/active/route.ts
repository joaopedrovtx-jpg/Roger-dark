import { NextResponse } from "next/server";
import { isGuardFail, requireAuth } from "@/lib/server/guards";
import { resolveActiveAcquirer } from "@/lib/acquirers/resolve";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

function maskSecret(key: string): string {
  const k = key.trim();
  if (!k) return "";
  if (k.length <= 10) return "••••••••";
  return `${k.slice(0, 8)}…${k.slice(-4)}`;
}

/**
 * GET /api/v1/acquirers/active
 * Status da adquirente do gateway (PodPay | Velana) — sem expor a secret completa.
 * Usado no playground de Pagamentos para o seller ver qual PSP processa o PIX.
 */
export async function GET(req: Request) {
  const gate = await requireAuth(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    const active = await resolveActiveAcquirer();

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
        orderBy: [{ isPrimary: "desc" }, { priority: "asc" }],
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
          !!active &&
          !!priv &&
          (active.id === a.id ||
            (provider !== "other" && active.provider === provider));

        list.push({
          id: a.id,
          name: a.name,
          code: a.code,
          provider,
          configured: !!priv,
          isPrimary: a.isPrimary,
          priority: a.priority,
          env: a.env || "live",
          secretHint: priv ? maskSecret(priv) : null,
          publicHint: pub ? maskSecret(pub) : null,
          active: isActive,
        });
      }
    }

    // Garante entradas mesmo sem DB
    if (!list.some((x) => x.provider === "velana")) {
      list.push({
        id: "velana",
        name: "Velana",
        code: "VELANA",
        provider: "velana",
        configured: active?.provider === "velana",
        isPrimary: active?.provider === "velana",
        priority: 2,
        env: "live",
        secretHint: null,
        publicHint: null,
        active: active?.provider === "velana",
      });
    }
    if (!list.some((x) => x.provider === "podpay")) {
      list.push({
        id: "podpay",
        name: "PodPay",
        code: "PODPAY",
        provider: "podpay",
        configured: active?.provider === "podpay",
        isPrimary: active?.provider === "podpay",
        priority: 1,
        env: "live",
        secretHint: null,
        publicHint: null,
        active: active?.provider === "podpay",
      });
    }

    const current =
      list.find((x) => x.active) ||
      list.find((x) => x.isPrimary && x.configured) ||
      null;

    return NextResponse.json({
      ok: true,
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
          }
        : active
          ? {
              id: active.id,
              name: active.code,
              code: active.code,
              provider: active.provider,
              env: "live",
              secretHint: null,
              publicHint: null,
              isPrimary: active.isPrimary,
            }
          : null,
      items: list,
      hint:
        "A secret da adquirente (Admin → Adquirentes → Credenciais) fica só no servidor. " +
        "Nesta página use a sk_ da sua conta (Integrações → API) para autenticar o teste.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
