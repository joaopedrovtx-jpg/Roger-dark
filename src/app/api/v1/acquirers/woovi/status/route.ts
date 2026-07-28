import { NextResponse } from "next/server";
import { isGuardFail, requireAdmin } from "@/lib/server/guards";
import {
  resolveWooviConfigServer,
  buildWooviAuthHeader,
} from "@/lib/acquirers/woovi/config";
import { wooviClient, WooviError } from "@/lib/acquirers/woovi/client";
import { prisma, isDatabaseConfigured } from "@/lib/server/prisma";
import { fromCents } from "@/lib/acquirers/woovi/mappers";

/**
 * GET /api/v1/acquirers/woovi/status
 * Testa AppID salvo (Admin) contra GET /api/v1/account/
 */
export async function GET(req: Request) {
  const gate = await requireAdmin(req);
  if (isGuardFail(gate)) return gate.error;

  try {
    let appHint: string | null = null;
    let isPrimary = false;

    if (isDatabaseConfigured()) {
      const row = await prisma.acquirer.findFirst({
        where: {
          OR: [
            { id: "woovi" },
            { code: "WOOVI" },
            { id: "openpix" },
            { code: "OPENPIX" },
          ],
        },
      });
      const k = (row?.privateKey || row?.publicKey || "").trim();
      if (k) appHint = `${k.slice(0, 12)}…${k.slice(-4)} (len ${k.length})`;
      isPrimary = !!row?.isPrimary;
    }

    const config = await resolveWooviConfigServer();
    if (!config?.appId) {
      return NextResponse.json({
        ok: false,
        configured: false,
        isPrimary,
        appHint,
        error:
          "Woovi sem AppID no banco. Cole o AppID em Admin → Adquirentes → Credenciais → Woovi (app.woovi.com → API/Plugins).",
        docs: "https://developers.openpix.com.br/docs/apis/api-getting-started",
        credentialsUrl: "https://app.woovi.com/home/applications",
      });
    }

    try {
      const accounts = await wooviClient.listAccounts(config);
      const list = accounts.accounts || [];
      const def = list.find((a) => a.isDefault) || list[0];
      const availableCents = def?.balance?.available ?? 0;
      return NextResponse.json({
        ok: true,
        configured: true,
        isPrimary,
        env: config.env,
        baseUrl: config.baseUrl,
        auth: "Authorization: SEU_APPID_AQUI",
        example: `curl --request GET --url ${config.baseUrl}/api/v1/charge --header 'Authorization: SEU_APPID_AQUI'`,
        appHint,
        accounts: list.length,
        balanceCents: availableCents,
        balanceReais: fromCents(availableCents),
        accountId: def?.accountId,
        message:
          "AppID Woovi VÁLIDO. A plataforma consegue criar PIX na conta Woovi.",
      });
    } catch (e) {
      const err = e as WooviError;
      const msg = e instanceof Error ? e.message : "Falha ao chamar Woovi";
      return NextResponse.json({
        ok: false,
        configured: true,
        isPrimary,
        env: config.env,
        baseUrl: config.baseUrl,
        auth: "Authorization: SEU_APPID_AQUI",
        authHeaderPreview:
          buildWooviAuthHeader(config.appId).slice(0, 18) + "…",
        appHint,
        code: err.code,
        error: msg,
        details: err.details,
        message:
          "AppID salvo, mas a Woovi rejeitou. Confira o AppID em app.woovi.com → API/Plugins (só AppID, sem pk/sk).",
        credentialsUrl: "https://app.woovi.com/home/applications",
        docs: "https://app.woovi.com/home/applications/tab/doc",
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
