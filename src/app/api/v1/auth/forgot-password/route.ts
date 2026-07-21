import { NextResponse } from "next/server";
import { z } from "zod";
import { checkLoginRateLimit, getClientIp, securityHeaders } from "@/lib/server/security";
import { requestPasswordReset } from "@/lib/server/password-reset";

const forgotSchema = z.object({
  email: z.string().trim().min(3).max(254),
});

export async function POST(req: Request) {
  try {
    let body: z.infer<typeof forgotSchema>;
    try {
      body = forgotSchema.parse(await req.json());
    } catch {
      // Anti-enumeração: mesma resposta, sem 400
      return NextResponse.json(
        { ok: true },
        { headers: securityHeaders() }
      );
    }

    const ip = getClientIp(req);
    // Rate limit específico do fluxo de reset (mesma chave do login + sufixo)
    const rate = await checkLoginRateLimit({ ip, email: body.email });
    if (!rate.ok) {
      return NextResponse.json(
        { ok: true },
        {
          status: 200,
          headers: {
            ...securityHeaders(),
            ...(rate.retryAfterSec
              ? { "Retry-After": String(rate.retryAfterSec) }
              : {}),
          },
        }
      );
    }

    await requestPasswordReset(body.email, {
      ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json(
      { ok: true, hint: "Se o e-mail existir, você receberá um link em alguns minutos." },
      { headers: securityHeaders() }
    );
  } catch {
    return NextResponse.json(
      { ok: true },
      { headers: securityHeaders() }
    );
  }
}
