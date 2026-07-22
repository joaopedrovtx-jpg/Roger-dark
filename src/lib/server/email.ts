import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}

function getFrom(): string {
  return process.env.EMAIL_FROM?.trim() || "DarkPay <onboarding@resend.dev>";
}

function appUrl(): string {
  return (
    process.env.APP_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0f0c;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f0c;padding:24px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#131914;border-radius:16px;overflow:hidden;border:1px solid #1f2a22">
<tr><td style="padding:32px 32px 8px;text-align:center">
<img src="${appUrl()}/logo-darkpay-clean.jpg" alt="DarkPay" height="36" style="display:block;margin:0 auto;opacity:0.95">
</td></tr>
<tr><td style="padding:8px 32px 32px;color:#d9e0da;font-size:15px;line-height:1.6">
${content}
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #1f2a22;text-align:center;color:#5a7162;font-size:12px">
DarkPay — Gateway de Pagamentos<br>
<span style="color:#3d5244">Este e-mail foi enviado automaticamente. Não responda.</span>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; mode: "resend" | "log" }> {
  const resend = getResend();

  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: getFrom(),
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      if (error) {
        console.error("[email] resend fail", error);
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
    html: baseLayout(`
<p style="margin:0 0 16px">Olá <strong style="color:#e3f2e7">${escapeHtml(name)}</strong>,</p>
<p style="margin:0 0 16px">Sua conta na DarkPay foi criada com sucesso! 🎉</p>
<p style="margin:0 0 16px">Agora você pode:</p>
<ul style="margin:0 0 16px;padding-left:20px;color:#bcd1c1">
<li>Acessar seu painel de vendas</li>
<li>Configurar suas integrações</li>
<li>Criar cobranças PIX</li>
<li>Acompanhar seus recebíveis</li>
</ul>
<div style="text-align:center;margin:24px 0">
<a href="${appUrl()}/dash" style="display:inline-block;padding:12px 28px;background-color:#1a8a4a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">Acessar painel</a>
</div>
<p style="margin:16px 0 0;color:#5a7162;font-size:13px">Complete seu cadastro e comece a vender hoje mesmo.</p>
`),
    text: `Olá ${name}, sua conta DarkPay foi criada! Acesse o painel em ${appUrl()}/dash e comece a vender.`,
  });
}

export async function sendPasswordResetEmail(to: string, name: string, link: string, ttlMin: number) {
  return sendEmail({
    to,
    subject: "Redefinição de senha — DarkPay",
    html: baseLayout(`
<p style="margin:0 0 16px">Olá <strong style="color:#e3f2e7">${escapeHtml(name)}</strong>,</p>
<p style="margin:0 0 16px">Recebemos um pedido de redefinição de senha. Se foi você, clique no botão abaixo em até <strong>${ttlMin} minutos</strong>:</p>
<div style="text-align:center;margin:24px 0">
<a href="${link}" style="display:inline-block;padding:12px 28px;background-color:#1a8a4a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600">Redefinir senha</a>
</div>
<p style="margin:0 0 16px;word-break:break-all;font-size:13px;color:#5a7162">Ou copie o link: <a href="${link}" style="color:#5a8a6a">${link}</a></p>
<p style="margin:16px 0 0;color:#5a7162;font-size:13px">Se não foi você, ignore este e-mail. Sua senha continua a mesma.</p>
`),
    text: `Olá ${name}, redefina sua senha em até ${ttlMin} minutos: ${link}`,
  });
}

export async function sendSaleNotificationEmail(to: string, name: string, amount: number, customer?: string) {
  return sendEmail({
    to,
    subject: `Venda aprovada — ${formatBRL(amount)}`,
    html: baseLayout(`
<p style="margin:0 0 16px">Olá <strong style="color:#e3f2e7">${escapeHtml(name)}</strong>,</p>
<div style="background:linear-gradient(135deg,#0f1f14,#1a3a24);border-radius:12px;padding:20px;text-align:center;margin:0 0 20px;border:1px solid #1f4a2e">
<p style="margin:0 0 4px;font-size:13px;color:#5a8a6a;text-transform:uppercase;letter-spacing:1px">Venda aprovada</p>
<p style="margin:0;font-size:32px;font-weight:700;color:#e3f2e7">${formatBRL(amount)}</p>
</div>
${customer ? `<p style="margin:0 0 8px">Cliente: <strong style="color:#e3f2e7">${escapeHtml(customer)}</strong></p>` : ""}
<p style="margin:16px 0 0;color:#5a7162;font-size:13px">O valor já está disponível em seu saldo.</p>
<div style="text-align:center;margin:20px 0 0">
<a href="${appUrl()}/transacoes" style="display:inline-block;padding:10px 24px;background-color:#1f2a22;color:#d9e0da;text-decoration:none;border-radius:8px;font-size:14px">Ver transações</a>
</div>
`),
    text: `Venda aprovada — ${formatBRL(amount)}${customer ? ` — Cliente: ${customer}` : ""}. Acesse o painel em ${appUrl()}/transacoes`,
  });
}

export async function sendWithdrawalEmail(to: string, name: string, amount: number, status: string, pixKey?: string) {
  const statusLabel =
    status === "pago"
      ? "aprovado"
      : status === "recusado"
        ? "recusado"
        : "processando";

  return sendEmail({
    to,
    subject: `Saque ${statusLabel} — ${formatBRL(amount)}`,
    html: baseLayout(`
<p style="margin:0 0 16px">Olá <strong style="color:#e3f2e7">${escapeHtml(name)}</strong>,</p>
<div style="background:linear-gradient(135deg,#0f1f14,#1a3a24);border-radius:12px;padding:20px;text-align:center;margin:0 0 20px;border:1px solid #1f4a2e">
<p style="margin:0 0 4px;font-size:13px;color:#5a8a6a;text-transform:uppercase;letter-spacing:1px">Saque ${statusLabel}</p>
<p style="margin:0;font-size:32px;font-weight:700;color:#e3f2e7">${formatBRL(amount)}</p>
</div>
${pixKey ? `<p style="margin:0 0 8px">Chave PIX: <strong style="color:#e3f2e7">${escapeHtml(pixKey)}</strong></p>` : ""}
<p style="margin:16px 0 0;color:#5a7162;font-size:13px">
${status === "pago" ? "O valor foi enviado para sua chave PIX." : status === "recusado" ? "O saque foi rejeitado. Entre em contato com o suporte." : "O saque está sendo processado e logo estará disponível."}
</p>
<div style="text-align:center;margin:20px 0 0">
<a href="${appUrl()}/financeiro" style="display:inline-block;padding:10px 24px;background-color:#1f2a22;color:#d9e0da;text-decoration:none;border-radius:8px;font-size:14px">Ver financeiro</a>
</div>
`),
    text: `Saque ${statusLabel} — ${formatBRL(amount)}. Acesse o painel em ${appUrl()}/financeiro`,
  });
}

export async function sendDocReviewEmail(to: string, name: string, docKind: string, status: string, notes?: string) {
  const statusLabel = status === "aprovado" ? "aprovado" : "rejeitado";
  const docLabel = docKind === "identidade" ? "documento de identidade" : docKind;

  return sendEmail({
    to,
    subject: `Documento ${statusLabel} — DarkPay`,
    html: baseLayout(`
<p style="margin:0 0 16px">Olá <strong style="color:#e3f2e7">${escapeHtml(name)}</strong>,</p>
<p style="margin:0 0 16px">Seu <strong>${escapeHtml(docLabel)}</strong> foi <strong>${statusLabel}</strong>.</p>
${notes ? `<div style="background-color:#1f2a22;border-radius:8px;padding:12px 16px;margin:0 0 16px;color:#bcd1c1;font-size:14px;border-left:3px solid ${status === "aprovado" ? "#1a8a4a" : "#b33a3a"}">${escapeHtml(notes)}</div>` : ""}
${status === "rejeitado" ? `<p style="margin:0 0 16px">Por favor, envie um novo documento com as correções indicadas.</p>
<div style="text-align:center;margin:20px 0 0">
<a href="${appUrl()}/configuracoes/documentos" style="display:inline-block;padding:10px 24px;background-color:#1a8a4a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px">Reenviar documento</a>
</div>` : `<p style="margin:16px 0 0;color:#5a7162;font-size:13px">Obrigado pela confiança! Todos os recursos da plataforma estão liberados.</p>`}
`),
    text: `Olá ${name}, seu documento (${docLabel}) foi ${statusLabel}.${notes ? ` Observação: ${notes}` : ""} Acesse em ${appUrl()}/configuracoes/documentos`,
  });
}
