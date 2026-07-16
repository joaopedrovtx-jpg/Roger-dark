/**
 * E-mail transacional (opcional).
 * Com RESEND_API_KEY envia de verdade; senão loga no console (dev/demo).
 */

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; mode: "resend" | "log" }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() || "DarkPay <onboarding@resend.dev>";

  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("[email] resend fail", err);
        return { ok: false, mode: "resend" };
      }
      return { ok: true, mode: "resend" };
    } catch (e) {
      console.error("[email] resend error", e);
      return { ok: false, mode: "resend" };
    }
  }

  console.info("[email:log]", {
    to: opts.to,
    subject: opts.subject,
    text: opts.text ?? opts.html.replace(/<[^>]+>/g, " ").slice(0, 200),
  });
  return { ok: true, mode: "log" };
}

export async function sendWelcomeEmail(to: string, name: string) {
  return sendEmail({
    to,
    subject: "Bem-vindo à DarkPay",
    html: `<p>Olá <strong>${name}</strong>,</p><p>Sua conta foi criada. Acesse o painel e complete seu cadastro.</p>`,
    text: `Olá ${name}, sua conta DarkPay foi criada.`,
  });
}

export async function sendPasswordResetEmail(to: string, link: string) {
  return sendEmail({
    to,
    subject: "Redefinir senha — DarkPay",
    html: `<p>Clique para redefinir sua senha:</p><p><a href="${link}">${link}</a></p><p>Link válido por 1 hora.</p>`,
    text: `Redefinir senha: ${link}`,
  });
}
