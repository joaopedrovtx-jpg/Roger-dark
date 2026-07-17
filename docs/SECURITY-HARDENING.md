# DarkPay — Hardening de segurança (17/07/2026)

Implementação da **Semana 0 + Sprint 1–2** do relatório de auditoria.

## Correções aplicadas

### Críticos
| Item | Status |
|------|--------|
| Proxy PodPay exige `requireAdmin` | ✅ todas as rotas `/api/v1/acquirers/podpay/**` |
| BFF Velana já exige admin | ✅ |
| Webhook PodPay HMAC obrigatório em produção | ✅ `verifyPodPaySignature` |
| Webhook Velana HMAC se `VELANA_WEBHOOK_SECRET` / `VELANA_REQUIRE_HMAC` | ✅ |
| Listagem admin **não** devolve secret completa | ✅ hints + `GET ?reveal=1` |
| Token de sessão só cookie httpOnly | ✅ removido sessionStorage |
| Token de sessão forte (crypto) | ✅ `generateSecureToken` |
| Cookie de sessão **assinado** (HMAC) | ✅ `packSessionCookie` / middleware Edge |
| Saque atômico (`balanceAvailable >= amount`) | ✅ `debitAvailableBalance` |
| Crédito de venda idempotente | ✅ `creditPaidSaleIdempotent` (webhooks + sync) |
| Simulação bloqueada em produção | ✅ `isMockAllowed()` |
| Security headers | ✅ `next.config.ts` + `securityHeaders()` |

### Sprint 1–2
| Item | Status |
|------|--------|
| Rate limit login (10 / 15 min) | ✅ |
| Senha mínima 10 + letras/números | ✅ |
| Seller `pendente` não cria cobrança | ✅ `assertSellerCanTransact` |
| Índices DB (seller+date, providerId, etc.) | ✅ schema.prisma |
| **2FA no login** (challenge assinado + TOTP) | ✅ `/api/v1/auth/login` → `requires2fa` + `/login/2fa` |
| **Backup codes hasheados** (bcrypt) | ✅ `hashBackupCodes` / `consumeBackupCode` |
| Middleware: formato + exp + **HMAC** no Edge | ✅ Web Crypto (`src/middleware.ts`) |
| Sessão no DB nos handlers | ✅ `getUserBySessionToken` (Prisma) |
| Admin metrics SUM/COUNT no SQL | ✅ dashboard, users, saques |
| Saldo: DB como fonte da verdade | ✅ balance.ts + gateways sync |
| Fila assíncrona de webhooks | ✅ `webhook-queue` (in-process) |
| CSRF leve (Origin/Host em mutações cookie) | ✅ `csrf.ts` + guards (prod / `CSRF_STRICT=1`) |

## Fluxo 2FA

1. `POST /api/v1/auth/login` com e-mail/senha válidos  
2. Se `User2FA.enabled` → `{ requires2fa: true, challenge }` (sem cookie)  
3. `POST /api/v1/auth/login/2fa` com `{ challenge, token }` (TOTP 6 dígitos ou backup code)  
4. Cookie httpOnly assinado + sessão no MySQL  

Setup: `GET/POST /api/v1/auth/2fa` (usuário logado) — backup codes plaintext **só uma vez**.

## Env de produção (obrigatórios)

Ver também `.env.example` completo.

```env
NODE_ENV=production
DATABASE_URL=mysql://...
SESSION_SECRET=...          # openssl rand -hex 32
PODPAY_WEBHOOK_SECRET=...   # obrigatório em produção

# Velana postbacks em produção:
# Preferir VELANA_WEBHOOK_SECRET + header de assinatura
VELANA_WEBHOOK_SECRET=...
# OU (não recomendado) liberar postback sem HMAC:
# VELANA_ALLOW_UNSIGNED_WEBHOOK=1

# REQUIRE_WEBHOOK_HMAC=1
# REQUIRE_ADMIN_2FA=1   # default em production

# NUNCA em produção:
# ALLOW_MOCK_DATA=1
```

### Velana webhook (produção)

| Config | Comportamento |
|--------|----------------|
| `VELANA_WEBHOOK_SECRET` setado | HMAC obrigatório |
| Sem secret + prod | **bloqueado** (`velana_unsigned_blocked_in_prod`) |
| `VELANA_ALLOW_UNSIGNED_WEBHOOK=1` | aceita sem HMAC (só se a Velana não assinar) |
| Dev local | aceita sem secret (reason `velana_hmac_optional`) |

## Como validar

```bash
# Typecheck
npx tsc --noEmit

# Smoke (com `npm run dev` em outro terminal)
node scripts/smoke-security.mjs
```

Checks manuais:
1. `GET /api/v1/acquirers/podpay/balance` sem login → **401/403**
2. `POST /api/v1/webhooks/podpay` em prod sem secret → **401**
3. `GET /api/v1/admin/acquirers` → `privateKey` vazio, `hasPrivateKey: true`
4. `GET /api/v1/admin/acquirers/velana?reveal=1` (admin) → chaves completas
5. Login 11x com senha errada → **429**
6. Conta com 2FA ativo → login pede código antes do cookie
7. Cookie adulterado (sig inválida) → middleware manda para `/login`

## Policy admin 2FA

| Env | Comportamento |
|-----|----------------|
| `NODE_ENV=production` | 2FA **obrigatório** para role `admin` |
| `REQUIRE_ADMIN_2FA=1` | força em qualquer env |
| `REQUIRE_ADMIN_2FA=0` | desliga a policy |

- Login de admin sem 2FA: sessão criada com `mustSetup2fa: true`
- `requireAdmin` devolve **403** `must_setup_2fa` até ativar
- Admin **não** pode desativar 2FA enquanto a policy estiver ativa
- Banner no `AdminShell` + aviso em Configurações → Segurança

## Go-live checklist

1. [ ] `SESSION_SECRET` forte (não o valor de exemplo)
2. [ ] `PODPAY_WEBHOOK_SECRET` + URL pública de postback
3. [ ] Velana: secret HMAC **ou** `VELANA_ALLOW_UNSIGNED_WEBHOOK=1` consciente
4. [ ] Admin ativa 2FA (policy em prod)
5. [ ] `ALLOW_MOCK_DATA` ausente
6. [ ] `npx tsc --noEmit` + `npm run smoke:security`
7. [ ] PIX real → sync/webhook → saldo MySQL → saque

## Ainda aberto (sprints futuros)

- [ ] Fila de webhooks distribuída (Redis/SQS) — hoje in-process
- [ ] Decimal/money types nativos no MySQL
- [ ] OpenTelemetry / APM completo (hoje: logger JSON leve)
- [x] 2FA **obrigatório** para admins (policy)
- [x] Saque unificado (débito DB + adquirente + row MySQL)
- [x] 2FA UI só via API (sem mock localStorage)
- [x] Velana HMAC fail-closed em produção
- [ ] Testes e2e (Playwright) + pentest formal
- [ ] Remover memory-store por completo (espelho residual em gateways)

## Arquivos-chave

| Área | Path |
|------|------|
| 2FA TOTP | `src/lib/server/totp.ts` |
| Cookie assinado | `src/lib/server/signed-token.ts` |
| Middleware Edge | `src/middleware.ts` |
| CSRF | `src/lib/server/csrf.ts` |
| Saldo atômico | `src/lib/server/balance.ts` |
| Fila webhook | `src/lib/server/webhook-queue.ts` |
| Metrics SQL | `src/lib/server/db/admin.service.ts` |
| Login + 2FA | `src/app/api/v1/auth/login/**` |
| Smoke | `scripts/smoke-security.mjs` |
| Policy admin 2FA | `src/lib/server/admin-2fa-policy.ts` |
| Logger | `src/lib/server/logger.ts` |
| Health + security | `src/app/api/health` |
