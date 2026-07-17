import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  resolveVelanaConfigServer,
  buildVelanaAuthHeader,
} from "@/lib/acquirers/velana/config";
import { velanaClient, VelanaError } from "@/lib/acquirers/velana/client";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";

/**
 * GET /api/v1/acquirers/velana/status
 * Testa secret key salva (Admin) contra GET /v1/balance/available.
 * Auth Velana: Basic base64(secretKey:x)
 */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    let publicHint: string | null = null;
    let secretHint: string | null = null;
    let isPrimary = false;

    if (isDatabaseConfigured()) {
      const row = await prisma.acquirer.findFirst({
        where: { OR: [{ id: "velana" }, { code: "VELANA" }] },
      });
      if (row?.publicKey?.trim()) {
        const k = row.publicKey.trim();
        publicHint = `${k.slice(0, 10)}…${k.slice(-4)}`;
      }
      if (row?.privateKey?.trim()) {
        const k = row.privateKey.trim();
        secretHint = `${k.slice(0, 10)}…${k.slice(-4)} (len ${k.length})`;
      }
      isPrimary = !!row?.isPrimary;
    }

    const config = await resolveVelanaConfigServer();
    if (!config?.secretKey) {
      return NextResponse.json({
        ok: false,
        configured: false,
        isPrimary,
        publicHint,
        secretHint,
        error:
          "Velana sem secret key no banco. Cole a chave pública (pk_) e a secret (sk_) em Admin → Adquirentes → Credenciais → Velana.",
        docs: "https://velana.readme.io/reference/introducao",
        credentialsUrl: "https://app.velana.com.br/settings/credentials",
      });
    }

    try {
      const balance = await velanaClient.getAvailableBalance(config);
      return NextResponse.json({
        ok: true,
        configured: true,
        isPrimary,
        env: config.env,
        baseUrl: config.baseUrl,
        auth: "Basic base64(secretKey:x)",
        publicHint,
        secretHint,
        balanceCents: balance.amount ?? 0,
        balanceReais: Math.round(balance.amount ?? 0) / 100,
        recipientId: balance.recipientId,
        message:
          "Credenciais Velana VÁLIDAS. A plataforma consegue criar PIX na conta da adquirente.",
      });
    } catch (e) {
      const err = e as VelanaError;
      const msg = e instanceof Error ? e.message : "Falha ao chamar Velana";
      const expired = err.code === "VELANA_KEY_EXPIRED";
      return NextResponse.json({
        ok: false,
        configured: true,
        isPrimary,
        env: config.env,
        baseUrl: config.baseUrl,
        auth: "Basic base64(secretKey:x)",
        authHeaderPreview:
          buildVelanaAuthHeader(config.secretKey).slice(0, 22) + "…",
        publicHint,
        secretHint,
        code: err.code,
        error: msg,
        details: err.details,
        message: expired
          ? "A Velana respondeu que a chave EXPIROU. Reset em app.velana.com.br → Credenciais de API e salve as novas chaves no Admin."
          : "Secret salva, mas a Velana rejeitou. Confira pk_/sk_ no painel da Velana.",
        credentialsUrl: "https://app.velana.com.br/settings/credentials",
        docs: "https://velana.readme.io/reference/introducao",
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
