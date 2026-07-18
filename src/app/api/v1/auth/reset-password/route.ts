import { NextResponse } from "next/server";
import { completePasswordReset } from "@/lib/server/password-reset";
import { securityHeaders } from "@/lib/server/security";

/** POST /api/v1/auth/reset-password — { email, code, password } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      code?: string;
      token?: string;
      password?: string;
    };

    const email = body.email?.trim() || "";
    const code = (body.code || body.token || "").trim();
    const password = body.password || "";

    if (!email || !code || !password) {
      return NextResponse.json(
        { error: "E-mail, código e nova senha são obrigatórios." },
        { status: 400, headers: securityHeaders() }
      );
    }

    await completePasswordReset({ email, code, password });

    return NextResponse.json(
      {
        ok: true,
        message: "Senha alterada com sucesso. Faça login com a nova senha.",
      },
      { headers: securityHeaders() }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao redefinir senha";
    return NextResponse.json(
      { error: msg },
      { status: 400, headers: securityHeaders() }
    );
  }
}
