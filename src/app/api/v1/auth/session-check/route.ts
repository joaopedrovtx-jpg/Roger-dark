import { NextResponse } from "next/server";
import { extractTokenFromRequest, getUserBySessionToken } from "@/lib/server/auth";
import { isDatabaseConfigured } from "@/lib/server/prisma";

export async function GET(req: Request) {
  const token = extractTokenFromRequest(req);
  if (!token || !isDatabaseConfigured()) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  const user = await getUserBySessionToken(token);
  if (!user) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  return NextResponse.json({
    valid: true,
    userId: user.id,
    status: user.status,
    roles: user.roles,
  });
}
