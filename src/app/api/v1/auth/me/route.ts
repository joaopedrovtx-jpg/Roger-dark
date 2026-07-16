import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";

/** GET /api/v1/auth/me */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json(
        {
          error: "Não autenticado",
          hint: "Faça login de novo. MySQL precisa estar no ar (npm run db:up && npm run db:seed).",
        },
        { status: 401 }
      );
    }
    return NextResponse.json(user);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
