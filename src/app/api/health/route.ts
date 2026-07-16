import { NextResponse } from "next/server";
import { isDatabaseConfigured, prisma } from "@/lib/server/prisma";

/** GET /api/health — healthcheck deploy */
export async function GET() {
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
  return NextResponse.json(
    {
      ok,
      service: "darkpay",
      time: new Date().toISOString(),
      database: db,
      podpay: !!process.env.PODPAY_API_KEY,
      email: !!process.env.RESEND_API_KEY,
      env: process.env.NODE_ENV,
    },
    { status: ok ? 200 : 503 }
  );
}
