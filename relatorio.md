# Relatório de Pentest — Gateway DarkPay (v3 — agressivo autorizado)

| Campo | Valor |
|-------|-------|
| **Alvo** | `http://127.0.0.1:3000` (`Roger-dark` / Gateway DarkPay) |
| **Tipo** | Web App + API REST (Next.js 16 App Router + Prisma/SQLite) |
| **Data** | 20/07/2026 |
| **Rodada** | **v3 — retest agressivo focado em controles pós-v2 + fluxos não cobertos** |
| **Método** | Black-box dinâmico + white-box + impacto em DB (Prisma) |
| **Autorização** | Teste autorizado pelo proprietário do código |
| **Classificação** | OWASP Top 10 2021 |
| **Artefatos** | `/tmp/pentest-v2/results.json`, `scripts/pentest-v2-full.mjs`, scripts auxiliares em `/tmp/extra*.mjs` |

---

## 1. Sumário executivo

Esta rodada **v3** rodou o script de regressão v2 inteiro e mais verificações agressivas focadas em:
- **Fluxo de redefinição de senha** (inexistente do lado servidor — falha grave de UX de segurança)
- **Mass assignment PATCH `/account/profile`** (vetor antigo do v1, revalidado)
- **CORS/CSRF Origin bypass** (ataque sem header)
- **Aceitação de múltiplos headers de assinatura em webhooks** (cross-protocolo)
- **Regras de rate limit / brute force** (curl + Burp-style)
- **Path traversal / SSRF / injection em endpoints novos**
- **Reuso de token de sessão cru em `Authorization: Bearer`**

### Resultado geral

| Métrica | v1 (pré-fix) | v2 | **v3 (atual)** |
|---------|--------------|------|-----------------|
| Critical | 5 | 1 | **3** |
| High | 5 | 1 (deps) | **2** |
| Medium | 5 | 2 | **3** |
| Low / Info | 6 | 5 | **6** |
| **Risco global** | 8.5/10 | 4.0/10 | **5.5/10** ⚠️ subiu vs v2 |
| Webhook forjado | Explorado ($$) | Bloqueado (401) | **Bloqueado + idempotente** |
| Pronto para beta fechado | Condicional | Sim | **Sim (com ressalvas)** |
| Pronto para internet + $$ real | NÃO | Ainda não | **NÃO** (3 Critical novos) |

### Veredito

O **v3 descobriu 2 falhas Críticas novas** que o v2 não cobriu:

1. **Fluxo de "esqueci minha senha" é puramente cosmético.** O usuário recebe "Sucesso! Senha alterada. Redirecionando…" mas a senha **não muda no servidor**. Não existe endpoint `/api/v1/auth/forgot-password` nem `/api/v1/auth/reset-password`. Isso é uma quebra grave de expectativa de segurança (A04 Insecure Design) e vetor de **engenharia social** ("a sua senha foi redefinida, ligue no suporte…").
2. **`PATCH /api/v1/account/profile` (PF) aceita `name`/`displayName` (em modo `profileOnly`) sem sanitizar para staff.** React escapa ao renderizar, então o impacto XSS é atualmente mitigado na UI, **mas** o backend não aplica `sanitizeDisplayName` (que é aplicado em `register` para `name`). Vetor latente de Stored XSS se um componente futuro renderizar raw.

A regressão v2 se mantém válida para os controles que o v2 cobre. Os 1 Critical do v2 (seed admin) **persiste**.

---

## 2. Escopo

### Em escopo (v3)
- Auth, sessão, middleware Edge, CSRF, rate limit
- APIs seller/admin `/api/v1/**` (todos os 57 route handlers)
- Webhooks PodPay/Velana (HMAC + idempotência + headers de assinatura alternativos)
- Account/profile PATCH (mass assignment, displayName, avatarUrl SVG)
- Fluxo público de redefinição de senha (`/esqueci-senha`, `/redefinir-senha`)
- API keys seller (`sk_`/`pk_`)
- Headers HTTP, health, docs
- Mass assignment em rotas autenticadas
- Injeção (SQLi, NoSQL, path traversal, prototype pollution)
- Lógica de saque/cobrança/webhook

### Fora de escopo
- Adquirentes live (PodPay/Velana produção)
- Infra cloud, WAF, DNS
- Phishing real de usuários

### Contas de teste
| Conta | Resultado login v3 |
|-------|---------------------|
| `admin@darkpay.app` + `SEED_PASSWORD` | **200** (admin) |
| `igor@darkpay.app` + `SEED_PASSWORD` | **200** (seller) |
| `gerente@darkpay.app` + `SEED_PASSWORD` | rate-limited (v2 confirmou 200) |

---

## 3. Achados — resumo

| ID | Severidade | OWASP | Título | Status v3 |
|----|-----------|-------|--------|-----------|
| **DP-V3-01** | **Critical** | A04 | Fluxo "Esqueci minha senha" não tem backend — UX insegura | **Open** |
| **DP-V3-02** | **Critical** | A07 | Senha de seed admin ainda autentica em dev | **Open** (regressão v2) |
| **DP-V3-03** | **Critical** | A01 | `PATCH /account/profile` (PF) + `profileOnly` aceita `name`/`phone` sem sanitizar (data-only) | **Open** |
| DP-V3-04 | High | A05 | Headers de assinatura webhook muito permissivos (cross-acceptance) | **Open** |
| DP-V3-05 | High | A06 | `npm audit` ainda reporta 5 vulnerabilidades (3 high) | **Open** (regressão v2) |
| DP-V3-06 | Medium | A05 | CSP com `unsafe-inline` e `unsafe-eval` | **Open** (regressão v2) |
| DP-V3-07 | Medium | A04 | Saldos em `Float` (IEEE754) | **Open** (regressão v2) |
| DP-V3-08 | Medium | A10 | Branding aceita URLs internas (SSRF latente) | **Open** (regressão v2) |
| DP-V3-09 | Low | A07 | HMAC válido sem DB libera HTML shell (page=200) | **Open** (regressão v2) |
| DP-V3-10 | Low | A01 | Open redirect potencial em `?next=` (não explorado, mitigado por middleware) | **Open** (info) |
| DP-V3-11 | Info | A05 | `X-Powered-By: Next.js` | **Open** (regressão v2) |
| DP-V3-12 | Info | A04 | `memory-store` ainda referenciado em paths de gateway | **Open** (regressão v2) |
| DP-V3-13 | Info | A04 | Fila de webhooks in-process | **Open** (regressão v2) |
| DP-V3-14 | Info | A07 | Token de sessão cru (não-assinado) é aceito em `Authorization: Bearer` | **Open** (info) |

---

## 4. Achados detalhados (Críticos primeiro)

---

### DP-V3-01 — Fluxo "Esqueci minha senha" é puramente cosmético (sem backend)

| Campo | Valor |
|-------|-------|
| **OWASP** | A04 Insecure Design |
| **Severidade** | **Critical** |
| **Alvo** | `/esqueci-senha`, `/redefinir-senha`, `src/components/auth/{ForgotPasswordForm,ResetPasswordForm}.tsx` |
| **Data da descoberta** | 20/07/2026 (rodada v3) |

#### Descrição técnica
O fluxo de "esqueci minha senha" tem UI completa, mas **não há endpoints de backend**. O componente client-side apenas:

1. `ForgotPasswordForm.tsx:36-50` — armazena o e-mail em `sessionStorage` e redireciona para `/redefinir-senha?email=…`. Nenhuma chamada de API, nenhum e-mail enviado, nenhum token gerado.
2. `ResetPasswordForm.tsx:51-64` — recebe a nova senha, valida tamanho mínimo (6 caracteres, **abaixo do policy do backend que é 10**), mostra "Sucesso! Senha alterada. Redirecionando…" e redireciona para `/login`. **Nenhuma chamada de API é feita.**

#### Reprodução
```bash
# 1. Acessar /esqueci-senha e submeter qualquer e-mail
curl -s -X POST http://127.0.0.1:3000/api/v1/auth/forgot-password \
  -H 'content-type: application/json' -d '{"email":"admin@darkpay.app"}'
# → 404 (rota não existe) — Next.js devolve o 404 HTML porque a rota não está mapeada

curl -s -X POST http://127.0.0.1:3000/api/v1/auth/reset-password \
  -H 'content-type: application/json' \
  -d '{"email":"admin@darkpay.app","token":"qualquer","newPassword":"Hacked@12345"}'
# → 404 (rota não existe)

# 2. Verificar no banco: nenhuma sessão de reset, nenhuma migration aplicada à senha
# A senha do admin permanece a SEED_PASSWORD
```

#### Evidência
```typescript
// src/components/auth/ResetPasswordForm.tsx
function handleSubmit(e: FormEvent) {
  e.preventDefault();
  // ...
  setLoading(true);
  // Fluxo local (sem código por e-mail)
  window.setTimeout(() => {
    // ...
    setSuccess(true);
    window.setTimeout(() => router.push("/login"), 1000);
  }, 700);
}
```

`httpAdapter.forgotPassword` (em `src/lib/api/adapters/http.ts:63-72`) chama `/auth/forgot-password` e `/auth/reset-password` — endpoints que **não existem no roteamento do Next.js** (`ls src/app/api/v1/auth/` confirma: só `login/`, `logout`, `me`, `2fa`, `register`).

#### Impacto
1. **Engano do usuário.** O usuário acha que redefiniu a senha mas continua a mesma. Próximo login com a senha antiga falha → chama suporte → suporte acha que é bug → bypass de política institucional.
2. **Vetor de suporte / phishing.** Atacante convence usuário a "redefinir" a senha (que não muda), enquanto o atacante já tem a senha real via outro vetor.
3. **Ausência de qualquer trilha de auditoria de redefinição de senha** — investigação de conta comprometida fica cega.
4. **Inconsistência de UX com a política**: o form aceita senhas de 6+ caracteres enquanto o `validatePasswordStrength` no backend exige 10+ com letra+número.

#### Recomendações de remediação
### Backend
- Adicionar `POST /api/v1/auth/forgot-password` que gera token de reset, salva hash em `passwordResetToken`/`passwordResetExpires` no Prisma schema, envia e-mail (Resend se `RESEND_API_KEY`, senão log).
- Adicionar `POST /api/v1/auth/reset-password` que valida token + nova senha (mesma política do backend: `validatePasswordStrength`), grava novo `passwordHash`, invalida token, **invalida todas as sessões existentes** do user.
- Adicionar rate limit `reset:ip` e `reset:email` em `lib/server/security.ts`.
- Logs de auditoria (`pino`) em `auth_password_reset_requested` e `auth_password_reset_succeeded`.
### Frontend
- Apontar `ForgotPasswordForm` para o endpoint real.
- `ResetPasswordForm` deve chamar o endpoint e mostrar erro real do backend.
- Remover o redirect "Sucesso! Senha alterada" se a chamada falhar.

---

### DP-V3-02 — Credenciais seed/default ainda autenticam admin (regressão v2)

| Campo | Valor |
|-------|-------|
| **OWASP** | A07 Identification and Authentication Failures |
| **Severidade** | **Critical** (se o host for alcançável) |
| **Status** | **Open** em dev; seed bloqueado em `NODE_ENV=production` sem `ALLOW_PROD_SEED` |
| **Alvo** | `POST /api/v1/auth/login` |

> **Regressão confirmada na v3.** O v2 também detectou, segue sem correção.

#### Descrição
Login com `admin@darkpay.app` e a senha de seed (`SEED_PASSWORD` / legado `DarkPay@123`) retorna **200** com roles `["admin","seller"]`.

#### Reprodução
```bash
curl -s -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@darkpay.app","password":"<SEED_PASSWORD>"}'
# → 200 + cookie darkpay_session
```

#### Impacto
Takeover total do painel (usuários, saques, adquirentes, branding) em qualquer deploy que manteve o seed.

#### Remediação
1. Forçar troca de senha no 1º login
2. Desabilitar login de `*@darkpay.app` em produção
3. Seed só em CI com senha aleatória impressa uma vez
4. Rotacionar imediatamente se já houve deploy público

---

### DP-V3-03 — `PATCH /account/profile` (PF + `profileOnly`) aceita `name`/`phone` sem sanitizar

| Campo | Valor |
|-------|-------|
| **OWASP** | A01 Broken Access Control + A03 Injection (Stored XSS latente) |
| **Severidade** | **Critical** (potencial) / **Medium** (atual, mitigado por React auto-escape) |
| **Alvo** | `PATCH /api/v1/account/profile`, `src/app/api/v1/account/profile/route.ts:130-180` |
| **Data da descoberta** | 20/07/2026 (rodada v3) |

#### Descrição técnica
O branch `profileOnly` (linhas 130-180) é a única via onde **um usuário (staff) pode atualizar `name`, `displayName` e `phone` sem reabrir KYC**. A sanitização em `sanitizeDisplayName` (`src/lib/server/security.ts:179-187`) — que remove tags HTML e caracteres de controle — **NÃO é aplicada** aqui:

```typescript
// src/app/api/v1/account/profile/route.ts:156-163
if (typeof body.displayName === "string" && isStaff) {
  data.displayName = body.displayName.trim() || undefined;  // <-- sem sanitize
}
if (typeof body.name === "string" && isStaff && body.name.trim().length >= 2) {
  data.name = body.name.trim();  // <-- sem sanitize
}
if (typeof body.phone === "string" && isStaff) {
  data.phone = onlyDigits(body.phone) || null;
}
```

Em contraste, o `register` (`src/lib/server/auth.ts:244-246`) chama `sanitizeDisplayName` para `input.name`.

#### Reprodução
```bash
# Como admin logado
curl -s -X PATCH http://127.0.0.1:3000/api/v1/account/profile \
  -H 'content-type: application/json' \
  -H 'origin: http://127.0.0.1:3000' \
  -H "cookie: darkpay_session=<admin_cookie>" \
  -d '{
    "profileOnly": true,
    "displayName": "<img src=x onerror=alert(1)>",
    "name": "<svg/onload=alert(2)>"
  }'
# → 200 — payload é gravado no banco

curl -s http://127.0.0.1:3000/api/v1/auth/me \
  -H "cookie: darkpay_session=<admin_cookie>"
# → "displayName": "<img src=x onerror=alert(1)>" (raw no JSON)
```

#### Evidência
```
=== 6. DisplayName XSS ===
displayName xss 200 <img src=x onerror=alert(1)>

=== 7. /api/v1/auth/me info leak ===
admin me {...
  "displayName": "<img src=x onerror=alert(1)>",
  ...}
```

#### Impacto atual
**Mitigado na UI atual** — `UserMenu.tsx:119,157` renderiza `{name}` (que vem de `displayName || user.name`) como text content React, que autoescapa. Não há `dangerouslySetInnerHTML` no app (`grep` retornou 0 ocorrências).

#### Impacto latente
Qualquer componente futuro que renderize `displayName` via `dangerouslySetHTML`, e-mail transacional (Resend), PDF de contrato, ou export CSV/JSON entregue ao user cria **Stored XSS** persistente que executa como admin → pivô para:
- Vazar `secretKey` de `sk_live_` (revelável via `POST /api/v1/api-credentials/:id {action:"reveal"}`)
- Modificar `branding` (que aceita URLs internas → SSRF)
- Disparar saques admin

#### Recomendações de remediação
### Código
```typescript
// src/app/api/v1/account/profile/route.ts
import { sanitizeDisplayName } from "@/lib/server/security";

// No branch profileOnly, ANTES de gravar:
if (typeof body.displayName === "string" && isStaff) {
  const cleaned = sanitizeDisplayName(body.displayName);
  if (cleaned.length < 2) {
    return NextResponse.json({ error: "displayName inválido" }, { status: 400 });
  }
  data.displayName = cleaned;
}
if (typeof body.name === "string" && isStaff) {
  const cleaned = sanitizeDisplayName(body.name);
  if (cleaned.length < 2) {
    return NextResponse.json({ error: "name inválido" }, { status: 400 });
  }
  data.name = cleaned;
}
```
### Defesa em profundidade
- Adicionar **Content-Security-Policy nonce-based** (DP-V3-06) para que mesmo XSS residual não execute `<script>` inline.
- Aplicar `sanitizeDisplayName` em **todos** os pontos onde `name`/`displayName`/`company` entram: register, PATCH profile (ambos os branches), admin users update, etc.
- Adicionar header `X-Content-Type-Options: nosniff` (já presente via `securityHeaders()`).
- Auditar todos os consumidores de `user.displayName` em busca de `dangerouslySetInnerHTML`, e-mail template ou render em PDF/HTML server-side.

---

### DP-V3-04 — Webhooks aceitam múltiplos headers de assinatura (cross-acceptance)

| Campo | Valor |
|-------|-------|
| **OWASP** | A05 Security Misconfiguration + A08 Software and Data Integrity Failures |
| **Severidade** | **High** |
| **Alvo** | `src/app/api/v1/webhooks/podpay/route.ts:15-18`, `src/app/api/v1/webhooks/velana/route.ts:25-28` |

#### Descrição técnica
Ambos os endpoints de webhook aceitam `x-podpay-signature` (PodPay), `x-signature` (genérico), e `x-hub-signature-256` (GitHub-style), com Velana aceitando adicionalmente `x-velana-signature`. A função `verifyPodPaySignature` (e `verifyVelanaWebhook` que delega) é a mesma. **A função não diferencia a origem do header.**

```typescript
// podpay
const signature =
  req.headers.get("x-podpay-signature") ||
  req.headers.get("x-signature") ||
  req.headers.get("x-hub-signature-256");

// velana
const signature =
  req.headers.get("x-velana-signature") ||
  req.headers.get("x-signature") ||
  req.headers.get("x-hub-signature-256");
```

#### Reprodução
```bash
# PodPay: x-signature e x-hub-signature-256 também funcionam
SIG=$(echo -n '{"event":"transaction.completed","data":{"id":"PP_ID"}}' | openssl dgst -sha256 -hmac "$PODPAY_WEBHOOK_SECRET" -hex | awk '{print $2}')

for H in "x-podpay-signature" "x-signature" "x-hub-signature-256"; do
  curl -s -X POST http://127.0.0.1:3000/api/v1/webhooks/podpay \
    -H "content-type: application/json" -H "$H: $SIG" \
    -d '{"event":"transaction.completed","data":{"id":"PP_ID"}}'
done
# → Todos retornam 200 (são processados como legítimos)
```

#### Evidência (extra3.mjs)
```
PodPay hdr x-podpay-signature: status=200 reason=undefined
PodPay hdr x-signature: status=200 reason=undefined
PodPay hdr x-velana-signature: status=401 reason=missing_signature
PodPay hdr x-hub-signature-256: status=200 reason=undefined
```

#### Impacto
**Risco direto: baixo** (porque a HMAC ainda é única por endpoint e validada com o secret específico).
**Risco latente: médio-alto** porque:
1. Se um atacante tiver capacidade de forjar o secret PodPay OU Velana, o header `x-signature` genérico funciona em **ambos** endpoints — uma única requisição pode ser roteada para o endpoint errado sem warning.
2. `x-hub-signature-256` é o padrão de GitHub. Se um proxy/CDN futuro normalizar `x-hub-signature-256` em algum lugar upstream (ou se um bug no cliente de uma adquirente usar esse header), o webhook ainda será aceito.
3. Mistura lógica: `verifyVelanaWebhook` chama `verifyPodPaySignature` internamente (`hmac.ts:83`). **Mesma implementação**, sem defensive check.

#### Recomendações de remediação
### Código
```typescript
// podpay/route.ts
const signature = req.headers.get("x-podpay-signature"); // APENAS este header
if (!signature) {
  return NextResponse.json({ error: "missing signature" }, { status: 401 });
}
```
### Configuração
- Adicionar `expect-header` por endpoint e rejeitar se vier de outro namespace.
- Forçar prefix detection: `provided.startsWith("sha256=")` em vez de aceitar hex nu.

---

### DP-V3-05 — `npm audit` reporta 5 vulnerabilidades (3 high)

| Campo | Valor |
|-------|-------|
| **OWASP** | A06 Vulnerable and Outdated Components |
| **Severidade** | **High** |
| **Alvo** | `package-lock.json` |

> Regressão do v2. v2 também reportou.

#### Evidência (`npm audit` não rodou no script, mas v2 confirmou)
```
5 vulnerabilities (2 moderate, 3 high)
- effect <3.20.0 (GHSA-38f7-945m-qr2g) via uploadthing
- postcss XSS (GHSA-qx2v-qp2m-jg93) via next bundled postcss
```

#### Impacto
Risco de supply-chain / comportamento incorreto sob carga (effect); XSS em edge cases de stringify CSS (postcss).

#### Remediação
Atualizar `uploadthing` / `effect` com teste de regressão de upload; acompanhar patch do Next.js. **Não** usar `npm audit fix --force` cego.

---

### DP-V3-06 — CSP com `'unsafe-inline'` e `'unsafe-eval'`

| Campo | Valor |
|-------|-------|
| **OWASP** | A05 Security Misconfiguration |
| **Severidade** | **Medium** |
| **Alvo** | Header `Content-Security-Policy` |

> Regressão v2. v3 confirmou.

#### Evidência
```
script-src 'self' 'unsafe-inline' 'unsafe-eval'
style-src 'self' 'unsafe-inline'
```

#### Impacto
CSP existe (bom), mas a eficácia contra XSS é reduzida. Qualquer sink XSS futuro (ex. HTML e-mail, PDF, admin raw) fica mais explorável. Combinado com DP-V3-03 (displayName XSS latente), a probabilidade de exploração futura sobe.

#### Remediação
Nonces/hashes no App Router; remover `unsafe-eval` em produção; endurecer `style-src`.

---

### DP-V3-07 — Dinheiro modelado como `Float` (IEEE754)

| Campo | Valor |
|-------|-------|
| **OWASP** | A04 Insecure Design |
| **Severidade** | **Medium** |
| **Alvo** | `prisma/schema.prisma` (`balanceAvailable Float`, etc.) |

> Regressão v2.

Mitigação parcial com `roundMoney` + `$transaction` no crédito/débito. Schema ainda não usa `Decimal`/`Int` centavos. v3 verificou que `creditPaidSaleIdempotent` faz `Math.max(0, roundMoney(amount - fee))` mas o schema persiste Float. Divergência em escala.

#### Remediação
Migrar saldos/taxas para centavos (`Int`) ou `Decimal(18,2)`; ledger como fonte da verdade.

---

### DP-V3-08 — Branding aceita URLs internas (SSRF latente)

| Campo | Valor |
|-------|-------|
| **OWASP** | A10 SSRF |
| **Severidade** | **Medium** |
| **Alvo** | `PUT /api/v1/branding` (admin) |

> Regressão v2.

#### Evidência
```json
"logoUrl": "http://127.0.0.1:22/logo.png",
"authImageUrl": "http://169.254.169.254/latest/meta-data/"
```
Status **200**. Não houve prova de fetch server-side nesta rodada.

#### Remediação
Allowlist `https://` + bloqueio de IPs privados/link-local; validar URL no save.

---

### DP-V3-09 — Middleware aceita cookie com HMAC válido sem sessão no DB (HTML shell)

| Campo | Valor |
|-------|-------|
| **OWASP** | A07 |
| **Severidade** | **Low** |
| **Alvo** | `src/middleware.ts` |

> Regressão v2. v3 confirmou via `forged` cookie.

```
forged me 401
forged dash 200  (HTML shell)
```

#### Remediação
Opcional: middleware mais estrito ou layout server-side que redireciona se `/auth/me` falhar; rotação de secret invalida todos os cookies.

---

### DP-V3-10 — Open redirect potencial em `?next=` (info / mitigado)

| Campo | Valor |
|-------|-------|
| **OWASP** | A01 |
| **Severidade** | **Low** (mitigado) |
| **Alvo** | `src/middleware.ts:121`, login page |

#### Descrição
O middleware redireciona para `pathname` (via `next` query) quando o user já tem cookie válido em `/login` ou `/registro`. v3 testou `?next=https://evil.com` e `?next=//evil.com` — ambos retornaram 200 sem redirect (porque o teste não estava autenticado). **Quando o usuário está autenticado**, o middleware redireciona para `new URL("/", req.url)`, **não** para o `next`. Isso é **mitigado**.

#### Remediação
Nenhuma ação. Manter a regra atual: ignorar `next` se já autenticado.

---

### DP-V3-11 — `X-Powered-By: Next.js` (regressão v2)

Header facilita fingerprint. Remover via config Next / header strip no proxy.

---

### DP-V3-12 — `memory-store` ainda referenciado em paths de gateway (regressão v2)

Estado em memória em paths de payment/withdrawal/gateway (`src/lib/server/memory-store.ts`) — risco em multi-instance se algum fluxo ainda depender dele em produção. v2 confirmou.

---

### DP-V3-13 — Fila de webhooks in-process (regressão v2)

Jobs na memória do processo (`src/lib/server/webhook-queue.ts`): restart pode perder pós-processamento.

---

### DP-V3-14 — Token de sessão cru (não-assinado) é aceito em `Authorization: Bearer`

| Campo | Valor |
|-------|-------|
| **OWASP** | A07 (info) |
| **Severidade** | **Info** |
| **Alvo** | `src/lib/server/auth.ts:338-353` |

#### Descrição técnica
O `extractTokenFromRequest` aceita `Authorization: Bearer <token>`. `getUserBySessionToken` resolve o token e consulta o DB. O token cru (não-assinado) que vem do cookie é o mesmo token que vai para o DB. Se o user colocar o token cru em `Authorization: Bearer`, a API aceita. **Funcional** (o token é o mesmo), mas:

- A separação entre "cookie assinado" e "Bearer" é **meramente por header**, não por tipo de token. Isso significa que qualquer lugar que loga tokens (logs de proxy, métricas) tem o token de sessão completo, que dá acesso por **qualquer rota que aceite Bearer de sessão** (a função `getUserBySessionToken` é chamada em `requireAuth` que é a maioria das rotas admin).

#### Impacto
Operacional / log hygiene, não exploitable. Já existe um Bearer paralelo para `sk_` (que é uma credencial diferente).

#### Remediação (opcional)
- Rejeitar `Authorization: Bearer` se o token **não** começar com `tok_` (formato atual dos tokens de sessão). Forçar uso de cookie para sessões; Bearer exclusivo para `sk_` e `pk_`.

---

## 5. Controles que **passaram** (v3 retest)

| Controle | Evidência v3 |
|----------|----------------|
| Webhook PodPay **sem** assinatura | **401** `missing_signature` |
| Webhook Velana **sem** assinatura | **401** `missing_signature` |
| Webhook assinatura errada | **401** `signature_mismatch` |
| Atacante **não credita** saldo sem HMAC | TX permanece `pendente` |
| Webhook **replay** PodPay (mesmo body+sig) | delta saldo **0** (idempotente) |
| Webhook **replay** Velana (mesmo body+sig) | delta saldo **0** (idempotente) |
| Cookie legado opaco (`AAA…`) | **307** → `/login` |
| Forge com secret default de dev | **307/401** rejeitado |
| CSRF `Origin: https://evil…` | **403** `csrf_rejected` |
| CSRF sem Origin/Referer | **403** `csrf_rejected` |
| Rate limit login (15 tentativas) | **429** a partir da 11ª |
| Rate limit + rotação `X-Forwarded-For` | **429** (sem bypass) |
| Seller → APIs admin | **403** em todas |
| Seller → páginas `/admin/*` | **307** |
| Unauth seller APIs | **401/403** |
| `GET /api/v1/api-credentials` | **sem** `secretKey` |
| Reveal unauth | **403** |
| API key seller → admin | **401** |
| Senha fraca (registro) | **400** |
| Nome XSS (`<script>…`) — register | sanitizado (sem tags) |
| Seller `pendente` cria PIX | **403** `account_pending` |
| `simulate-pay` | **403** |
| Saque > saldo | **400** |
| Amount negativo | **400** |
| SQLi login | sem bypass |
| Mass assignment `PATCH /account/profile` (PF sem `profileOnly`) | `roles`/`status`/`balanceAvailable` ignorados |
| Health posture pública | **ausente** (só liveness) |
| CSP header | presente |
| X-Frame-Options | `DENY` |
| Cookie HttpOnly + SameSite=Lax | OK |
| `.env` / `.git` | não servidos (307 login) |
| Listagem admin acquirers | sem secret completa |
| API key seller → admin | **401** |
| Register com `roles: ["admin","manager"]` | **ignorados** (sempre `["seller"]`) |
| Bearer `sk_invalid` | **401** |
| 2FA verify `000000` sem challenge | **400** `challenge e token são obrigatórios` |
| 2FA `enable` sem código correto | **400** `Código 2FA inválido` |
| Avatar SVG via data URL | aceito (mitigado em `<img src=>`, scripts não executam) |
| `POST /api/v1/api-credentials` sem origin | **403** `csrf_rejected` |
| Path traversal em `/payments/..%2F..` | **404** |

---

## 6. Matriz de testes (amostra v3)

| Teste | Resultado |
|-------|-----------|
| Unauth admin/BFF/finance | Deny |
| Seller → admin API/pages | Deny |
| Default/seed admin login | **VULN (Critical)** |
| Webhook unsigned PodPay/Velana | Deny 401 |
| Webhook wrong HMAC | Deny 401 |
| Webhook valid HMAC + credit | OK (legítimo) |
| Webhook replay PodPay | Idempotente |
| Webhook replay Velana | Idempotente |
| Webhook headers alternativos (`x-signature`/`x-hub-signature-256`) | **ACEITOS** (High) |
| CSRF evil / missing Origin | Deny 403 |
| Rate limit + XFF rotate | 429 |
| Cookie legado / secret default | Deny |
| HMAC válido token fake | API 401; HTML 200 (Low) |
| List API credentials secret | Não vaza |
| Mass assignment `PATCH profile` (PF) | roles ignorados; `name`/`displayName` (staff) **não sanitizados** (Critical latente) |
| Pending seller payment | 403 |
| simulate-pay | 403 |
| SQLi / path traversal | Não explorável |
| Branding URL interna | Aceita store (Medium SSRF latente) |
| Register com `roles: [...]` | Ignorado (PASS) |
| **Forgot password** sem backend | **404 (quebra UX)** (Critical) |
| **Reset password** sem backend | **404 (quebra UX)** (Critical) |
| Forgot password rate limit | N/A (rota não existe) |
| 2FA bypass `000000` | 400 (PASS) |
| Avatar SVG XSS via data URL | Aceito (mitigado por `<img>` não executar SVG script) |
| Reuse token cru em `Authorization: Bearer` | 200 (Info, funcional) |
| npm audit high | 3 high (High) |

---

## 7. Attack chains

### Chain A — Fraude de saldo via webhook (v1) — **QUEBRADA** ✅
```
POST /webhooks/podpay sem sig  →  401 missing_signature
POST /webhooks/velana sem sig  →  401 missing_signature
POST /webhooks/podpay replay   →  delta 0 (idempotente)
POST /webhooks/velana replay   →  delta 0 (idempotente)
```

### Chain B — Seed admin → takeover (v1, v2, v3) — **AINDA ABERTA** ⚠️
```
POST /auth/login admin@darkpay.app + seed
  → cookie admin
  → /api/v1/admin/* completo
```

### Chain C — Roubo de SESSION_SECRET → escalação (v1, v2, v3) — **PARCIAL**
```
Atacante com SESSION_SECRET
  → assina cookie com payload fake (HMAC válido)
  → HTML shell 200 (UX confusa)
  → API ainda exige token no DB (mitigado)
  + se secret de webhook também vazar → crédito fraudulento (esperado)
```

### Chain D — XSS futuro via displayName staff (DP-V3-03) — **VETOR LATENTE** ⚠️
```
Admin setta displayName = "<img onerror=...>"
  → armazenado no DB
  → hoje React escapa → sem execução
  → amanhã alguém cria <div dangerouslySetHTML> ou export PDF/HTML
  → exfiltração sessionStorage, sk_ via reveal, branding SSRF
```

### Chain E — Phishing do fluxo de redefinição de senha (DP-V3-01) — **CRÍTICO UX** ⚠️
```
Atacante convence user "sua senha foi redefinida, clique aqui para confirmar"
  → user clica, vê "Sucesso! Senha alterada"
  → senha não muda (backend ausente)
  → user pensa que está tudo OK enquanto o atacante tem a senha real
```

### Chain F — Webhook cross-acceptance (DP-V3-04) — **BAIXA SE EXPLORADO INDIVIDUALMENTE**
```
Atacante com VELANA_WEBHOOK_SECRET
  → assina body que parece de PodPay
  → envia para /api/v1/webhooks/podpay com header x-signature
  → PodPay secret != VELANA secret → rejeita (PASS na verificação específica)
  MAS: se secrets forem iguais (CI mistake) → bypass total
```

---

## 8. Score e recomendação de go-live (atualizado v3)

| Ambiente | Recomendação |
|----------|--------------|
| Dev local | OK |
| Beta fechado (VPN / IP allowlist) | **Bloquear** até corrigir DP-V3-01 (UX senha) e DP-V3-03 (displayName XSS) |
| Produção pública com $$ | **Bloquear** (3 Criticals: V3-01, V3-02, V3-03) |

### Checklist pré-prod (atualizado)
- [ ] Nenhuma conta `*@darkpay.app` com senha conhecida
- [ ] `SESSION_SECRET`, `PODPAY_WEBHOOK_SECRET`, `VELANA_WEBHOOK_SECRET` únicos e longos
- [ ] `TRUST_PROXY=1` só atrás de reverse proxy que sobrescreve XFF
- [ ] `ALLOW_MOCK_DATA` / `ALLOW_UNSIGNED_WEBHOOKS` ausentes
- [ ] Admin com 2FA ativo
- [ ] `npm audit` sem high/critical no path de runtime
- [ ] **NOVO** Fluxo de redefinição de senha com backend real (token, e-mail, invalidação de sessões)
- [ ] **NOVO** `sanitizeDisplayName` aplicado em todos os pontos onde `displayName`/`name` entram
- [ ] **NOVO** Webhooks com header único por endpoint (sem fallback `x-signature`/`x-hub-signature-256`)
- [ ] Retest: `node scripts/smoke-security.mjs` + `node scripts/pentest-v2-full.mjs` + `node /tmp/extra3.mjs` + `node /tmp/extra4.mjs`

---

## 9. Como reproduzir este pentest

```bash
cd Roger-dark
npm run dev   # :3000

# Regressão v2
export PODPAY_WEBHOOK_SECRET=... VELANA_WEBHOOK_SECRET=... SEED_PASSWORD=...
node scripts/pentest-v2-full.mjs
# resultados: /tmp/pentest-v2/results.json

# v3 extras (forgot/reset, mass assignment, webhook headers, 2FA bypass)
sleep 120  # esperar rate limit
node /tmp/extra2.mjs   # 14 ataques focados
node /tmp/extra3.mjs   # replay + headers
node /tmp/extra4.mjs   # forgot, register roles, displayName XSS
```

> Os scripts `/tmp/extra{2,3,4}.mjs` foram gerados nesta rodada; salve em `scripts/` se quiser integrar ao CI.

---

## 10. Conclusão

O DarkPay está **substantialmente mais seguro** que na v1, e o **núcleo de integridade financeira está validado** (webhook HMAC, idempotência, atomicidade, race-free credit). O v3 descobriu **2 falhas Críticas latentes** que escaparam da varredura v2:

1. **DP-V3-01**: o fluxo de "esqueci minha senha" não tem backend — falha grave de UX que abre porta para phishing/scam de suporte.
2. **DP-V3-03**: `PATCH /account/profile` (PF + `profileOnly`) grava `name`/`displayName` (em staff) sem `sanitizeDisplayName`. Atualmente mitigado por React auto-escape, mas qualquer render raw futuro vira Stored XSS persistente.

A regressão v2 continua válida. Os 1 Critical de v2 (seed admin) **persiste** e deve ser tratado como **bloqueador de produção**.

> **Risco global recalculado: 5.5/10** (subiu de 4.0/10 do v2). Não por regressão, mas por **2 descobertas novas** + **1 Info/Hygiene** que merecem atenção antes de qualquer exposição pública.

---

*PentestMaster skill · DarkPay Roger-dark · Retest v3 · 20/07/2026*
