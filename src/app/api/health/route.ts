import { NextResponse } from "next/server";
import { isDatabaseConfigured, prisma } from "@/lib/server/prisma";
import { isProduction } from "@/lib/server/security";

/** GET /api/health — liveness mínimo (sem posture detalhada pública) */
export async function GET(req: Request) {
  const { warnWeakSecrets } = await import("@/lib/server/security");
  warnWeakSecrets();

  let db: "ok" | "down" | "unconfigured" = "unconfigured";
  if (isDatabaseConfigured()) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "ok";
    } catch {
      db = "down";
    }
  }

  const ok = db !== "down";

  // Posture detalhada só com header interno ou query secret
  const detailKey = process.env.HEALTH_DETAIL_KEY?.trim();
  const wantDetail =
    detailKey &&
    (req.headers.get("x-health-key") === detailKey ||
      new URL(req.url).searchParams.get("key") === detailKey);

  if (!wantDetail) {
    return NextResponse.json(
      {
        ok,
        service: "darkpay",
        time: new Date().toISOString(),
        database: db === "ok" ? "ok" : db,
      },
      { status: ok ? 200 : 503 }
    );
  }

  const { isAdmin2faRequired } = await import("@/lib/server/admin-2fa-policy");
  const { isMockAllowed } = await import("@/lib/server/security");
  const { webhookQueueSize } = await import("@/lib/server/webhook-queue");

  const sessionSecretOk =
    (process.env.SESSION_SECRET?.trim().length ?? 0) >= 32 ||
    (process.env.NEXTAUTH_SECRET?.trim().length ?? 0) >= 32;

  return NextResponse.json(
    {
      ok,
      service: "darkpay",
      time: new Date().toISOString(),
      database: db,
      env: process.env.NODE_ENV,
      security: {
        production: isProduction(),
        mockAllowed: isMockAllowed(),
        sessionSecretConfigured: sessionSecretOk,
        admin2faRequired: isAdmin2faRequired(),
        podpayWebhookHmac: !!process.env.PODPAY_WEBHOOK_SECRET,
        velanaWebhookHmac: !!process.env.VELANA_WEBHOOK_SECRET,
        velanaAllowUnsigned:
          !isProduction() &&
          process.env.VELANA_ALLOW_UNSIGNED_WEBHOOK === "1",
        csrfStrict: process.env.CSRF_STRICT !== "0",
        webhookQueueSize: webhookQueueSize(),
      },
      features: {
        podpayKey: !!process.env.PODPAY_API_KEY,
        email: !!process.env.RESEND_API_KEY,
      },
    },
    { status: ok ? 200 : 503 }
  );
}
