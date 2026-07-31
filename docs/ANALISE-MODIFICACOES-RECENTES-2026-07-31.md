# Análise detalhada — modificações recentes no GitHub

**Data da varredura:** 2026-07-31  
**Repositório:** `joaopedrovtx-jpg/Roger-dark` (`main`)  
**Base comparada:** `ecefde3` → `abe3864` (4 commits)  
**Produção:** `darkpays.online` / VPS `179.197.72.94` (deploy feito no mesmo dia)

> Escopo: tudo que entrou após o commit de UI da logo (`ecefde3`), com foco especial no **Cloudflare Turnstile** e no pacote arquitetural (hooks, providers, services, segurança, Prisma, saques, webhooks).

---

## 1. Resumo executivo

| Dimensão | Situação |
|----------|----------|
| Volume | **~101 arquivos**, **+5.127 / −1.228** linhas |
| Autores | Roger (3 commits principais) + fix de build Luan Mickael (1) |
| Tema dominante | Reintrodução do **Cloudflare Turnstile** + grande **camada de hooks/services** + hardening de segurança |
| Código “pronto e ligado” | Turnstile (código), Toast/Impersonate/SaleNotifications montados, proxy `x-pathname`, saque/rate-limit refatorados, índices Prisma |
| Código “pronto mas não adotado” | Quase todos os hooks React Query; vários services novos sem callers |
| Produção real | Site **online** em `abe3864`, mas **sem chaves Turnstile** e **sem tabelas** `rate_limits` / `webhook_jobs` no MySQL |

**Veredito em uma frase:** o push recente mistura (a) features realmente ativadas (notificações de venda no layout, anti-bot Turnstile no código, hardening de saque/rate-limit) com (b) um **grande scaffold arquitetural** ainda não consumido pelas telas, e (c) **lacunas de ops** (env + migração DB) que deixam partes do hardening **inertes ou fail-open** em produção.

---

## 2. Linha do tempo dos commits

| Hash | Data | Autor | Título | Papel |
|------|------|-------|--------|-------|
| `64ea228` | 2026-07-30 | Roger | `update: various changes across api, components, lib, and prisma` | Núcleo: segurança, fila, saque, Prisma, register com Zod, session-check, env |
| `b9444e7` | 2026-07-30 | Roger | `fix: admin layout permission check, dash auth, circular imports, tailwind` | Proxy → `x-pathname`; auth em `/dash`; `types.ts`; `darkMode: 'class'` |
| `757a74e` | 2026-07-31 | Roger | `feat: cloudflare turnstile, toast/impersonate providers, hooks e serviços` | Turnstile + 27+ hooks + Toast/Impersonate + services + doc arquitetura |
| `abe3864` | 2026-07-31 | Luan | `fix: coerce Prisma Decimal to number in metrics-rollup` | Desbloqueou o **build VPS** (typecheck Decimal) |

### Contexto histórico do Turnstile (antes da janela)

| Hash | Evento |
|------|--------|
| `b57951a` / `8609ecb` | Turnstile existia; fix de botão Entrar travado |
| `9246def` + `7962905` (22/jul) | **Remoção completa** do Cloudflare Turnstile |
| `757a74e` (31/jul) | **Reintrodução** com design mais maduro (hook + widget + server verify) |

Isso não é “primeira implementação”: é um **re-add** depois de remoção consciente. Qualquer decisão de produto (ligar captcha em prod) precisa considerar o motivo da remoção anterior (provavelmente UX/travamento/config incompleta).

---

## 3. Cloudflare Turnstile — análise minuciosa

### 3.1 Arquitetura em camadas

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (LoginForm / RegisterForm)                          │
│  TurnstileWidget → useTurnstile → script CF api.js          │
│  token → body.turnstileToken                                │
└───────────────────────────┬─────────────────────────────────┘
                            │ POST /api/v1/auth/login|register
┌───────────────────────────▼─────────────────────────────────┐
│ API Route                                                   │
│  isTurnstileServerEnabled() ? verifyTurnstile(token, req)   │
│  → siteverify (secret + response + remoteip)                │
│  fail → 403  |  ok / disabled → segue auth                  │
└─────────────────────────────────────────────────────────────┘
```

| Camada | Arquivo | Função |
|--------|---------|--------|
| Env | `.env.example`, `src/lib/env.ts` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| Client hook | `src/hooks/useTurnstile.ts` (~265 linhas) | Load script, render, token, reset, expired, cdata≤32 |
| Widget UI | `src/components/auth/TurnstileWidget.tsx` | `<div ref>` + `onReady` controller |
| Forms | `LoginForm.tsx`, `RegisterForm.tsx` | Exige token se `enabled`; reset em erro / 2FA |
| Zod | `src/lib/api/schemas.ts` | `turnstileToken?: string` em login/register |
| Domain | `src/lib/domain/types.ts` | `RegisterInput.turnstileToken?` |
| Server | `src/lib/server/turnstile.ts` | `siteverify` fail-closed com timeout 8s |

### 3.2 Comportamento de enable/disable (importante)

| Lado | Condição “ligado” | Se desligado |
|------|-------------------|--------------|
| **Client** | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` length > 8 | Widget **não renderiza**; form **não exige** token |
| **Server** | `TURNSTILE_SECRET_KEY` length ≥ 8 | `verifyTurnstile` retorna `{ ok: true }` (skip) |

Implicações de segurança:

1. **Só site key no client, sem secret:** widget aparece, usuário resolve captcha, mas o servidor **ignora** o token → anti-bot cosmético (bot pode omitir o token e a API aceita).
2. **Só secret no server, sem site key:** widget some no client; form não manda token; se o server estiver “enabled”, login/register **quebram** com 403 (token ausente).
3. **As duas keys:** fluxo correto fail-closed.
4. **Nenhuma key (estado atual da VPS):** anti-bot **totalmente desligado** em produção.

> **Produção (2026-07-31):** no `.env` da VPS **não há** `TURNSTILE_*` configurado (apenas `TRUST_PROXY=1` entre as flags de segurança amostradas). Ou seja: o código do Turnstile está deployado, mas **não protege** login/registro ainda.

### 3.3 Fluxo no login (detalhes bons)

- Payload montado com `turnstileToken` só se `ts.enabled`.
- Em `!res.ok`: `ts.reset()` (token CF é single-use).
- Em `requires2fa`: também `reset()` — correto, porque o token já foi consumido no POST de login; o step 2FA **não** revalida Turnstile (só o challenge TOTP). Isso é aceitável se o 2FA for curto e rate-limited.

### 3.4 Fluxo no registro

- `RegisterForm` passa `turnstileToken` para `register()`.
- Rota `register` agora usa **`registerSchema` Zod** (antes: cast manual frágil) **antes** do rate-limit e do create user.
- Ordem: parse Zod → Turnstile → rate-limit IP → validações de nome/email → `registerWithPassword`.

### 3.5 Qualidade do server verify

Pontos fortes:

- Timeout `AbortSignal.timeout(8000)`.
- Envia `remoteip` (útil com `TRUST_PROXY=1`).
- **Não** usa `idempotency_key` estável por IP (comentário documenta risco de conflito).
- Mensagens humanizadas (`timeout-or-duplicate`, `invalid-input-response`, secret inválido).
- Logs estruturados (`turnstile_verification_failed`, etc.).
- Fail-closed em erro de rede/HTTP da CF **quando secret está setado**.

Pontos de atenção:

- Não valida `hostname` retornado pelo siteverify (ideal: restringir a `darkpays.online` / `www`).
- Não valida `action` (`login` vs `register`) — token de um fluxo poderia, em tese, ser reutilizado no outro no mesmo ciclo de vida do token.
- `turnstileToken` no Zod é **optional** mesmo com secret ligado — a trava real é só o `if (isTurnstileServerEnabled())` + length check, não o schema.

### 3.6 Qualidade do client hook

Pontos fortes:

- Script inject singleton (`SCRIPT_ID`).
- `cdata` truncado em 32 chars (limite CF).
- Tema dark default, idioma `pt-br`.
- Callbacks: success / error / expired / timeout.
- `reset()` limpa token **antes** de chamar `turnstile.reset` (evita submit com token morto).
- Cleanup `remove` no unmount.

Pontos de atenção:

- `onReady` no widget depende de lista de deps parcial + eslint-disable — risco baixo de loop, mas controller pode ficar stale se o pai só gravar em `ref` (hoje Login/Register usam `ref`, ok).
- Gate `siteKey.length > 8` é heurístico (keys CF reais são bem mais longas; ok).

### 3.7 CSP e Turnstile

`securityHeaders()` em `src/lib/server/security.ts` agora inclui:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...
  connect-src 'self'; frame-ancestors 'none'
```

Esse header é aplicado em **respostas de API**, não no HTML do Next (via `next.config`).  
**Hoje não bloqueia** o script `challenges.cloudflare.com` nas páginas de login.

**Se no futuro** o mesmo CSP for aplicado ao document HTML, o Turnstile **quebra** sem allowlist:

- `script-src` → `https://challenges.cloudflare.com`
- `frame-src` / `child-src` → `https://challenges.cloudflare.com`
- `connect-src` → `https://challenges.cloudflare.com`

### 3.8 Checklist para ligar Turnstile em produção

1. Cloudflare Dashboard → Turnstile → widget com hostname `darkpays.online` (+ `www` se usar).
2. VPS `.env`:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY=...`
   - `TURNSTILE_SECRET_KEY=...`
3. Rebuild **obrigatório** do Next (site key é `NEXT_PUBLIC_*`, embutida no bundle client).
4. Testar login falha sem captcha, sucesso com captcha, reset após senha errada, fluxo 2FA.
5. Monitorar logs `turnstile_*`.

---

## 4. Providers e notificações

### 4.1 Root layout — árvore nova

```
QueryProvider
  └─ AuthProvider
       └─ ImpersonateProvider          ← NOVO (montado)
            └─ BrandingProvider
                 └─ ToastProvider      ← NOVO (montado)
                      └─ SaleNotificationsProvider  ← NOVO no root
                           └─ {children}
```

Isso fecha um gap documentado em `ARQUITETURA-SERVICES-CONTEXTS-HOOKS.md` (que ainda diz, de forma desatualizada, que SaleNotifications **não** estava no layout).

### 4.2 SaleNotificationsProvider — atenção: **triplo mount**

O provider agora existe em:

1. `src/app/layout.tsx` (global)
2. `src/components/layout/AppShell.tsx` (seller)
3. `src/components/admin/AdminShell.tsx` (admin)

Efeito colateral provável:

- **Polling duplicado** de transações/vendas
- Risco de **toasts/sons em dobro** se a lógica de claim não for 100% global
- Maior carga no browser e na API

O fix de anti-duplicata (`1e7954b`, anterior a esta janela) mitiga multi-aba via localStorage claim, mas **não** elimina dois providers na mesma aba.

**Recomendação:** manter **apenas** no `RootLayout` **ou** apenas nos shells — não nos dois.

### 4.3 ToastProvider / useToast

- Implementação completa (~168 linhas): stack de toasts, auto-dismiss, API `useToast()`.
- **Montado**, mas **nenhuma view migrada** ainda (grep de consumo real nas páginas ≈ zero além do próprio provider).
- Feedbacks de erro/sucesso continuam majoritariamente com `useState` local.

### 4.4 ImpersonateProvider / useImpersonate

- Contexto React em cima do storage/event existente (`impersonate.ts`).
- Hook `useImpersonationBanner` preparado.
- Banner antigo (`ImpersonationBanner`) ainda pode estar no path legado — validar unificação visual.

---

## 5. Camada de hooks (`src/hooks/`) — scaffold massivo

### 5.1 Inventário (~2.000 linhas)

| Grupo | Hooks | Propósito |
|-------|-------|-----------|
| Auth/anti-bot | `useTurnstile` | **Único usado de fato nas telas** |
| Seller data | `useDashboard`, `useTransactions`, `useSellerFinance`, `useWithdrawals`, `usePayments`, `usePixCharge`, `usePaymentStatus`, `useDocuments`, `useAccountProfile`, `useApiCredentials`, `useUtmifyIntegration` | React Query wrappers |
| Admin | `useAdminDashboard`, `useAdminUsers`, `useAdminAcquirers`, `useAdminManagers`, `useAdminWithdrawals`, `useAdminPermissions` | React Query wrappers |
| UX | `useClipboard`, `useConfirm`, `useCountdown`, `useDebounce`, `useMediaQuery`, `useBugReport`, `useReconcileOnFocus`, `useSaleSound`, `useEmailNotificationPrefs`, `useImpersonationBanner` | Utilitários |

### 5.2 Consumo real no código

Imports de `@/hooks/*` **fora** da própria pasta de hooks:

- `LoginForm` / `RegisterForm` / `TurnstileWidget` → **só Turnstile**
- Hooks entre si (ex.: `usePixCharge` → `usePayments`)

**Conclusão:** a migração para React Query **não aconteceu nas views**.  
`@tanstack/react-query` segue instalado; `QueryProvider` montado; mas as páginas ainda usam `authedFetch` + `useEffect` (padrão antigo).

### 5.3 `query-client.ts`

- `apiGet` / `apiPost` / `apiPatch` / `apiDelete` + `ApiError`
- Baseado em `authedFetch` (cookie + impersonate header)
- Bom foundation; morto sem adoção nas views

### 5.4 Doc `docs/ARQUITETURA-SERVICES-CONTEXTS-HOOKS.md`

Documento valioso (mapa de services/endpoints/gaps), porém **já desatualizado no dia do commit**:

- Diz que React Query tem zero uso e que `src/hooks/` não existe — **agora existe**
- Diz que SaleNotifications/Toast/Impersonate faltam — **já montados**
- Lista services como “faltando” e o commit **cria** os arquivos — mas **não os liga** a rotas admin

Tratar o doc como **intent / backlog**, não como estado runtime.

---

## 6. Services de servidor novos

| Service | Arquivo | Propósito declarado | Wired a rotas/UI? |
|---------|---------|---------------------|-------------------|
| `auditLog.service.ts` | helper genérico de audit | **Parcial** — vários admin services ainda fazem `prisma.auditLog.create` direto |
| `feature-flags.service.ts` | flags runtime (+ override via tabela RateLimit) | **Não** — callers ≈ 0; reusa `RateLimit` como KV |
| `metrics-rollup.service.ts` | materializa `MetricDaily` | **Não** — sem cron/route; fix Decimal no build |
| `session-revocation.service.ts` | listar/revogar sessões | **Não** — sem endpoint admin |
| `upload.service.ts` | validação upload | **Não** — UploadThing segue direto |
| `webhook-endpoints.service.ts` | outbound webhooks seller | **Não** |
| `webhook-replay.service.ts` | replay inbox | **Não** |
| `turnstile.ts` | anti-bot | **Sim** — login/register |

**Padrão geral:** “library first” — código de qualidade média/alta, **sem superfície HTTP** ainda. Risco: falsa sensação de feature pronta.

---

## 7. Segurança e infra de runtime

### 7.1 Rate limit persistente (`security.ts`)

**Antes:** `Map` em memória (reset a cada deploy/restart → brute-force window reabre).  
**Depois:** `prisma.rateLimit` upsert + increment.

| Aspecto | Avaliação |
|---------|-----------|
| Intenção | Excelente |
| Produção hoje | Tabela **`rate_limits` NÃO existe** no MySQL da VPS |
| Comportamento se tabela falta | `catch { return { ok: true } }` → **fail-open** (rate limit desligado) |
| Janela | `expiresAt` é **empurrado a cada attempt** no update — semântica diferente de sliding window clássica; pode alongar bloqueio ou distorcer contagem dependendo da leitura de `attempts` |

**Ação ops necessária:** `prisma db push` / migration criando `rate_limits` (e idealmente job de purge por `expiresAt`).

### 7.2 CSRF (`csrf.ts`)

- Passa a ler `env.CSRF_STRICT` via envalid.
- Normaliza localhost/127.0.0.1/::1.
- **Deixa de usar** `x-forwarded-host` na validação de Host — só `host`.
- Em setups atrás de proxy com Host reescrito incorretamente, pode gerar falsos positivos de CSRF; com nginx correto em `darkpays.online` tende a ficar ok.

### 7.3 Env tipado (`env.ts`)

Novos campos validados:

- `TRUST_PROXY`, `CSRF_STRICT`, `CSRF_ALLOW_MISSING_ORIGIN`
- `WOOVI_WEBHOOK_SECRET`, `ALLOW_UNSIGNED_WEBHOOKS`
- `API_SECRET_ENCRYPTION_KEY`
- Keys PodPay/Velana/Woovi
- Turnstile public + secret

Isso reduz `process.env` solto e falhas silenciosas de typo — **positivo**.

### 7.4 Fila de webhooks (`queue.ts`)

- Sai do array em memória; grava `WebhookJob` (pending → processing → completed/failed).
- `retryStuckJobs()` marca stuck, **mas não reprocessa payload** (só status `stuck`).
- Payload gravado é `{ provider, ts }` — **não o body real do webhook** → utilidade forense limitada.
- Produção: tabela **`webhook_jobs` ausente** → create falha no try/catch e executa “sem persistência” (fallback).

### 7.5 Proxy / middleware (`middleware.ts` → `proxy.ts`)

Next 16 convention: export `proxy` em vez de `middleware`.

Mudança funcional crítica:

```ts
res.headers.set("x-pathname", pathname);
```

Usado por `admin/layout.tsx` no lugar de `next-url` (que **não existia** de forma confiável) → **permissões de gerente por path voltam a funcionar**.

### 7.6 Auth de páginas

- `/dash` agora é server component com `getSessionUser()` + redirect login.
- Admin layout permission check corrigido via `x-pathname`.

### 7.7 `next.config.ts` — Cache-Control removido de `/_next/static`

Removido:

```
Cache-Control: public, max-age=31536000, immutable  (prod)
```

Impacto:

- Assets estáticos podem ser revalidados a cada request (mais latência/banda).
- Não reintroduz sozinho o bug antigo de CSS “sumir”, mas **remove uma otimização** deliberada.

### 7.8 CSP em respostas API

Header CSP rígido em JSON de API é inofensivo para browsers consumindo XHR/fetch, mas:

- polui respostas;
- se copiado para HTML sem allowlist CF, quebra Turnstile (ver §3.7).

---

## 8. Domínio financeiro / adquirentes

### 8.1 Saque (`withdrawal.service.ts`) — mudança de ordem

**Antes (resumo):** debitava saldo no DB cedo; depois chamava adquirente com `skipLocalDebit` se já debitado.  
**Depois:**

1. Checa saldo (sem debitar).
2. Chama adquirente.
3. `debitAfterAcquirer()` **depois** do sucesso da chamada remota.
4. Se remote já `recusado`, estorna (increment).
5. Em falha geral, estorno com **ledger** `reversal_withdrawal_failed` em `$transaction`.

| Prós | Contras / riscos |
|------|------------------|
| Evita ficar “preso” com saldo debitado se a adquirente falhar na criação | Janela entre check de saldo e debit → **corrência** (dois saques paralelos) |
| Ledger no estorno melhora auditoria | Mensagem “Saldo insuficiente (concorrência)” aparece se debit falhar após acquirer — dinheiro pode ter saído na adquirente e o debit local falhar (precisa reconciliação) |
| `resolveAcquirerForPayout()` sem sellerId reforça regra “PIX out white global” | Depende 100% da flag admin de payout primary |

### 8.2 Balance (`balance.ts`)

- Não reabre charges `cancelled` para `paid` (só `waiting_payment` / `expired`).
- Refund de pendente usa `updateMany` com `balancePending: { gte: amount }` (evita saldo negativo).
- Log de falha em `notifySaleApproved`.
- Ajuste fino nos matchers de `providerId` Woovi.

### 8.3 Taxa default schema `mdrFixed` 0.15 → **1.00**

Alinha com a regra de negócio já documentada em `seller-fees.ts`:

- ≤ R$50 → R$1 fixo  
- \> R$50 → 3%

**Impacto:** só em **novos users / defaults de schema**, não reescreve sellers existentes. Ainda assim, seeds e `PlatformFeePlan` default mudam.

### 8.4 Índices MySQL (performance)

Em `schema.mysql.prisma`:

- `transactions`: `(sellerId, date)`, `(sellerId, status)`, `(provider, providerId)`, `acquirerId`
- `withdrawals`: `(sellerId, status)`, `providerId`
- `payment_charges`: `providerId`, `transactionId`, `(sellerId, status)`
- `balance_ledger`: **unique** `(referenceType, referenceId)` + index `type`
- `metric_daily`: index `userId`

+ modelos novos:

- `RateLimit`
- `WebhookJob`

**Ops:** índices/tabelas novas **não foram aplicadas** na VPS só com `prisma generate` — precisa `db push`/migrate controlado em janela de manutenção.

### 8.5 Outros

- `session-check` GET leve (`valid`, `userId`, `status`, `roles`).
- Register endurecido com Zod.
- Vários gateways (PodPay/Velana/Woovi) com ajustes pontuais de mapeamento/erro (diff agregado ~60 linhas no Woovi).

---

## 9. O que está de fato “vivo” vs “morto” em produção

| Item | Código no GitHub | Build VPS | Runtime prod efetivo |
|------|------------------|-----------|----------------------|
| Turnstile client/server | ✅ | ✅ | ❌ desligado (sem env) |
| ToastProvider montado | ✅ | ✅ | ✅ montado; pouco usado |
| SaleNotifications root | ✅ | ✅ | ✅ (possível **duplo** com shells) |
| ImpersonateProvider | ✅ | ✅ | ✅ montado |
| Hooks React Query | ✅ | ✅ | ❌ views não consomem |
| Services novos (rollup, flags, …) | ✅ | ✅ | ❌ sem cron/rotas |
| Rate limit DB | ✅ | ✅ | ❌ tabela ausente → fail-open |
| WebhookJob durable | ✅ | ✅ | ❌ tabela ausente → fallback memória/inline |
| Proxy `x-pathname` | ✅ | ✅ | ✅ permissões admin |
| Auth `/dash` server | ✅ | ✅ | ✅ |
| Fix Decimal metrics-rollup | ✅ | ✅ | N/A (service não cronado) |
| mdrFixed default 1.00 | ✅ schema | generate only | só novos registros |

---

## 10. Riscos priorizados

### P0 — ops / segurança

1. **Turnstile não configurado em prod** → bots de registro/login sem captcha (mitigado só por rate-limit, que também está fail-open).  
2. **Tabela `rate_limits` inexistente** → rate limit de login/2FA/register **não persiste e não bloqueia** (fail-open no catch).  
3. **Tabela `webhook_jobs` inexistente** → fila “durável” não dura.

### P1 — comportamento / dinheiro

4. **Ordem debit-after-acquirer** em saque: cenários de falha parcial exigem reconciliação e testes de corrência.  
5. **Unique em `balance_ledger (referenceType, referenceId)`** sem migração cuidadosa pode falhar se já existirem duplicatas históricas.  
6. **Triplo `SaleNotificationsProvider`** → polling/notificações duplicadas.

### P2 — arquitetura / dívida

7. Hooks e services **órfãos** (custo de manutenção sem ROI até migrar as views).  
8. Doc de arquitetura **desatualizado** no mesmo PR que o implementa parcialmente.  
9. Remoção do `Cache-Control` immutable em static assets.  
10. CSP API rígida sem allowlist CF (problema futuro se expandida ao HTML).

### P3 — produto

11. Turnstile re-adicionado após remoção em 22/jul — alinhar se é decisão permanente.  
12. Default `mdrFixed=1.00` no schema vs contas antigas com 0.15.

---

## 11. Matriz de recomendação (próximos passos)

| # | Ação | Esforço | Impacto |
|---|------|---------|---------|
| 1 | Criar tabelas `rate_limits` + `webhook_jobs` (+ índices) na VPS com backup | Médio | Alto (segurança/ops) |
| 2 | Configurar Turnstile keys + rebuild, **ou** documentar “captcha off” consciente | Baixo | Alto |
| 3 | Remover mount duplicado de `SaleNotificationsProvider` nos shells | Baixo | Médio (UX/CPU) |
| 4 | Testes automatizados do fluxo de saque (sucesso / recusa acquirer / corrência) | Médio | Alto |
| 5 | Adotar 2–3 hooks nas views críticas (dashboard, saque, login errors → toast) | Médio | Médio |
| 6 | Cron `metrics-rollup` ou endpoint admin + schedule | Médio | Médio (perf admin) |
| 7 | Validar `hostname`/`action` no siteverify | Baixo | Médio |
| 8 | Atualizar `ARQUITETURA-SERVICES-CONTEXTS-HOOKS.md` para refletir estado real | Baixo | Doc |
| 9 | Restaurar `Cache-Control` immutable em `/_next/static` | Baixo | Perf |
| 10 | Rotacionar senha root da VPS (apareceu em histórico de git/scripts) | Baixo | Crítico (ops) |

---

## 12. Conclusão

As modificações recentes no GitHub são **ambiciosas e majoritariamente bem estruturadas**, com três eixos claros:

1. **Cloudflare Turnstile** — reimplementação séria (client + server + UX de reset), mas **ainda inerte em produção** por falta de secrets.  
2. **Arquitetura “próxima geração”** — dezenas de hooks e services, providers de toast/impersonate/notificações, doc de mapa. Grande parte ainda é **scaffolding**.  
3. **Hardening operacional** — rate-limit e fila de webhook no DB, CSRF/env tipado, permissões admin via `x-pathname`, saque com ledger de estorno. A intenção é correta, mas **sem migration o runtime continua no caminho antigo (fail-open)**.

O fix `abe3864` foi necessário só para o typecheck de `Decimal` no build; não altera produto.

**Em produção hoje o usuário sente principalmente:**

- site de pé no commit `abe3864`;
- providers de notificação montados (com possível duplicidade);
- **sem captcha Cloudflare visível/forçado**;
- rate-limit e webhook job “novos” **ainda sem dentes** até existir tabela no MySQL.

---

*Gerado por varredura de `git diff ecefde3..abe3864`, leitura dos módulos-chave e checagem pontual do estado na VPS (env Turnstile mascarado, `SHOW TABLES` para `rate_limits`/`webhook_jobs`).*
