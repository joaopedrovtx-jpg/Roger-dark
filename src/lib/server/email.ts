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

/**
 * E-mail de redefinição de senha com código + link.
 */
export async function sendPasswordResetEmail(
  to: string,
  opts: { code: string; link: string; name?: string }
) {
  const name = opts.name?.trim() || "usuário";
  const code = opts.code.trim();
  const link = opts.link;
  return sendEmail({
    to,
    subject: "Código para redefinir senha — DarkPay",
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0a0f0c">
        <h2 style="margin:0 0 12px;font-size:20px">Redefinir senha</h2>
        <p style="margin:0 0 12px;line-height:1.5">Olá <strong>${escapeHtml(name)}</strong>,</p>
        <p style="margin:0 0 12px;line-height:1.5">
          Recebemos um pedido para redefinir a senha da conta
          <strong>${escapeHtml(to)}</strong> na DarkPay.
        </p>
        <p style="margin:0 0 8px;line-height:1.5">Use o código abaixo:</p>
        <p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:0.2em;font-family:ui-monospace,monospace">
          ${escapeHtml(code)}
        </p>
        <p style="margin:0 0 12px;line-height:1.5">
          Ou abra o link:
          <br/>
          <a href="${escapeAttr(link)}" style="color:#0a0f0c;font-weight:600">${escapeHtml(link)}</a>
        </p>
        <p style="margin:0;font-size:13px;color:#555;line-height:1.45">
          O código expira em <strong>1 hora</strong>. Se você não pediu isso, ignore este e-mail.
        </p>
      </div>
    `,
    text: `Olá ${name},\n\nCódigo para redefinir a senha da conta ${to}: ${code}\n\nLink: ${link}\n\nVálido por 1 hora. Se não foi você, ignore este e-mail.`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
