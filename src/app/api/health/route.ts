import { NextResponse } from "next/server";
import { isDatabaseConfigured, prisma } from "@/lib/server/prisma";
import { isAdmin2faRequired } from "@/lib/server/admin-2fa-policy";
import { isProduction, isMockAllowed } from "@/lib/server/security";
import { webhookQueueSize } from "@/lib/server/webhook-queue";

/** GET /api/health healthcheck + posture de segurança (sem secrets) */
export async function GET() {
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
  const sessionSecretOk =
    (process.env.SESSION_SECRET?.trim().length ?? 0) >= 16 ||
    (process.env.NEXTAUTH_SECRET?.trim().length ?? 0) >= 16;

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
          process.env.VELANA_ALLOW_UNSIGNED_WEBHOOK === "1",
        csrfStrict:
          process.env.CSRF_STRICT === "1" || process.env.NODE_ENV === "production",
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
