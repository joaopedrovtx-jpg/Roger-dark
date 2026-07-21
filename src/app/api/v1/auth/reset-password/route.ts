import { NextResponse } from "next/server";
import { z } from "zod";
import { checkLoginRateLimit, getClientIp, securityHeaders, validatePasswordStrength } from "@/lib/server/security";
import { consumePasswordReset } from "@/lib/server/password-reset";

const resetSchema = z.object({
  email: z.string().trim().min(3).max(254),
  token: z.string().min(10).max(512),
  newPassword: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    let body: z.infer<typeof resetSchema>;
    try {
      body = resetSchema.parse(await req.json());
    } catch {
      return NextResponse.json(
        { error: "Dados inválidos." },
        { status: 400, headers: securityHeaders() }
      );
    }

    const ip = getClientIp(req);
    const rate = await checkLoginRateLimit({ ip, email: body.email });
    if (!rate.ok) {
      return NextResponse.json(
        { error: "Muitas tentativas. Tente novamente em alguns minutos." },
        {
          status: 429,
          headers: {
            ...securityHeaders(),
            ...(rate.retryAfterSec
              ? { "Retry-After": String(rate.retryAfterSec) }
              : {}),
          },
        }
      );
    }

    const pwdErr = validatePasswordStrength(body.newPassword);
    if (pwdErr) {
      return NextResponse.json(
        { error: pwdErr },
        { status: 400, headers: securityHeaders() }
      );
    }

    const result = await consumePasswordReset(
      body.email,
      body.token,
      body.newPassword,
      { ip, userAgent: req.headers.get("user-agent") ?? undefined }
    );

    if (!result.ok) {
      const statusByReason: Record<string, number> = {
        invalid_token: 400,
        expired_token: 410,
        used_token: 410,
        weak_password: 400,
        no_db: 503,
      };
      const status = statusByReason[result.reason] ?? 400;
      const messageByReason: Record<string, string> = {
        invalid_token: "Token inválido. Solicite um novo link de redefinição.",
        expired_token: "Link expirado. Solicite um novo.",
        used_token: "Este link já foi utilizado. Solicite um novo.",
        weak_password:
          "Senha muito fraca. Use ao menos 10 caracteres, com letras e números.",
        no_db: "Serviço indisponível. Tente novamente mais tarde.",
      };
      return NextResponse.json(
        { error: messageByReason[result.reason] ?? "Falha ao redefinir." },
        { status, headers: securityHeaders() }
      );
    }

    return NextResponse.json(
      { ok: true, message: "Senha redefinida. Faça login novamente." },
      { headers: securityHeaders() }
    );
  } catch {
    return NextResponse.json(
      { error: "Falha ao redefinir." },
      { status: 500, headers: securityHeaders() }
    );
  }
}
