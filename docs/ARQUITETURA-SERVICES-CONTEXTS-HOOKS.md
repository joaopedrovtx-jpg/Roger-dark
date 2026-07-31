# Arquitetura — Services, Contexts & Hooks

> Análise completa do projeto **Gateway DarkPay** (Next.js 16 App Router · React 19 · Prisma 6 · MySQL/SQLite · TanStack React Query 5).
>
> Este documento mapeia **todos os serviços, contextos/providers e hooks** já existentes no projeto, detalha suas funções e lista **as lacunas (gaps)** que ainda precisam ser implementadas para o projeto atingir o estado desejado.

---

## 0. Visão geral da stack

| Camada | Tecnologia | Observação |
|---|---|---|
| Framework | Next.js 16.2 (App Router) | `src/app/**` |
| UI | React 19 + Tailwind 3 + Lucide + Recharts | |
| Tipagem | TypeScript 6 | `strict` |
| DB/ORM | Prisma 6 (SQLite dev / MySQL prod) | `prisma/schema.prisma` |
| Data fetching | `@tanstack/react-query` 5 | ✅ instalado · hooks em `src/hooks/*` · ⚠️ views ainda majoritariamente com `authedFetch` |
| Auth | bcryptjs + otplib + cookie HMAC (Edge) | `src/proxy.ts` middleware |
| E-mail | Resend | `src/lib/server/email.ts` |
| Upload | UploadThing | `src/app/api/uploadthing/**` |
| Logs | pino + `BugLog` (MySQL) | `src/lib/server/logger.ts` / `bug-log.ts` |
| Validação | Zod 4 | |
| Outros | axios, qrcode, envalid, zod | |

Padrão arquitetural: **todas as mutações passam por API routes em `src/app/api/v1/**`**, protegidas por guards (`requireAuth`, `requireSellerAuth`, `requireAdmin`, `requireStaffPermission`) — que fazem CSRF + sessão + API key + 2FA + permissões de gerente.

RootLayout encadeia: `QueryProvider → AuthProvider → ImpersonateProvider → BrandingProvider → ToastProvider → SaleNotificationsProvider`.

---

## 1. Services (Serviços)

### 1.1 `src/lib/server/` — Núcleo de servidor

| Arquivo | Propósito | Principais exports |
|---|---|---|
| `prisma.ts` | Singleton do `PrismaClient` (hot-reload safe); detecta schema desatualizado. | `prisma`, `isDatabaseConfigured()` |
| `auth.ts` | Autenticação real: sessão httpOnly + Bearer opcional; cria sessão SHA-256 no DB, cookie assinado, enriquece `AuthUser` com 2FA/KYC/permissões. | `loginWithPassword`, `registerWithPassword`, `createSessionForUser`, `getUserBySessionToken`, `getSessionUser`, `logoutByToken`, `hashPassword`, `verifyPassword`, `enrichAuthUser`, `extractTokenFromRequest`, `sessionCookieOptions`, `assertDatabase`, `SESSION_COOKIE_NAME` |
| `guards.ts` | Guards HTTP das APIs: CSRF + sessão + API key (sk_) + status de conta + 2FA + escopo de impersonate. | `requireAuth`, `requireAdmin`, `requireStaffPermission`, `requireSellerAuth`, `accountNotActiveResponse`, `resolveSellerScope`, `viewOnlyForbidden`, `isGuardFail`, `VIEW_SELLER_HEADER` |
| `csrf.ts` | CSRF para mutações autorizadas por cookie (Origin/Host + SameSite=Lax); desligível via `CSRF_STRICT=0`. | `validateSessionCsrf`, `csrfFailResponse` |
| `security.ts` | Hardening: IP de trust proxy, secret check, rate-limit persistente em `RateLimit`, token seguro, headers CSP/HSTS, validação de senha forte, sanitização, `roundMoney`. | `isProduction`, `getClientIp`, `warnWeakSecrets`, `isMockAllowed`, `generateSecureToken`, `securityHeaders`, `checkLoginRateLimit*`, `checkRegisterRateLimit`, `check2faRateLimit`, `validatePasswordStrength`, `sanitizeDisplayName`, `assertSellerCanTransact`, `roundMoney` |
| `signed-token.ts` | Tokens HMAC-SHA256 para o middleware Edge (cookie `token|exp|status` + challenge 2FA `userId|exp`). | `resolveSessionSecret`, `signPayload`, `verifySignedPayload`, `packSessionCookie`, `unpackSessionCookie`, `create2faChallenge`, `verify2faChallenge` |
| `totp.ts` | 2FA TOTP (RFC 6238) via `otplib` + códigos de backup hasheados com bcrypt. | `generateTotpSecret`, `totpKeyUri`, `verifyTotp`, `generateBackupCodes`, `hashBackupCode(s)`, `consumeBackupCode`, `backupCodeFingerprint` |
| `admin-2fa-policy.ts` | Policy: admins devem ter 2FA em prod (dev via `REQUIRE_ADMIN_2FA`). | `isAdmin2faRequired`, `rolesIncludeAdmin`, `userHas2faEnabled`, `adminMustSetup2fa` |
| `password-reset.ts` | Recuperação de senha: token SHA-256 no `PasswordReset`, anti-enumeração, cooldown, reset atômico (troca senha + invalida todas as sessões). | `requestPasswordReset`, `consumePasswordReset`, `ResetResult` |
| `email.ts` | Wrapper do Resend (fallback p/ log); templates dark: welcome, reset, venda aprovada, saque, doc review. | `sendEmail`, `sendWelcomeEmail`, `sendPasswordResetEmail`, `sendSaleNotificationEmail`, `sendWithdrawalEmail`, `sendDocReviewEmail` |
| `notify-email.ts` | Liga e-mail → `NotificationSetting` — só dispara se o seller optou-in. | `notifySaleApproved`, `notifyWithdrawalStatus`, `notifyDocReview` |
| `logger.ts` | Logger pino com redação de campos sensíveis. | `log` |
| `bug-log.ts` | Bug log persistente em `BugLog` + espelho no pino. | `reportBug`, `reportRouteError`, `BugSource`, `BugLevel`, `BugReportInput` |
| `hmac.ts` | Verificação das assinaturas dos webhooks (PodPay/ Velana / Woovi). | `verifyWooviWebhook`, `verifyPodPaySignature`, `verifyVelanaWebhook` |
| `queue.ts` | Fila de webhooks **durável** em `WebhookJob` table (pending→processing→completed/failed/stuck). | `enqueueWebhookJob`, `retryStuckJobs`, `getQueueSize`, `closeQueue` |
| `webhook-queue.ts` | Apenas re-exporta `enqueueWebhookJob`, `getQueueSize`. | — |
| `webhook-inbox.ts` | Outbox idempotente: cada webhook registrado em `AuditLog` (action=`webhook_inbox`) para replay. | `recordInbox`, `markInbox`, `listPendingInbox`, `InboxEvent` |
| `balance.ts` | **Operações atômicas de saldo** (`$transaction` + CAS): débito de saque, crédito idempotente de venda paga, rejeição de pendente, reembolso, push UTMify. **Fonte da verdade do dinheiro.** | `debitAvailableBalance`, `creditPaidSaleIdempotent`, `rejectPendingSaleIdempotent`, `refundSaleIdempotent`, `notifyUtmifyAfterPaid` |
| `seller-fees.ts` | Plano de taxas (MDR/saque) lido de `User.mdrPercent/mdrFixed/saquePercent/saqueFixed`. | `parseSellerFeePlan`, `computeSaleFeeAmount`, `computeSaleNetAmount`, `computeWithdrawFeeAmount`, `computeWithdrawNetAmount`, `getSellerSaleFees`, `getSellerFeePlan` |
| `reconcile-payments.ts` | Reconcilia cobranças `waiting_payment` com a adquirente e expira vendas pendentes > 15 min; reconcilia saques `processando`. | `expireAbandonedPendingSales`, `reconcilePendingPayments`, `reconcilePendingWithdrawals`, `PENDING_SALE_TTL_MINUTES` |
| `memory-store.ts` | Cache `globalThis` p/ branding/transações/saques/saldos/cobranças — **bloqueia escritas em prod**. | `getStore`, `resetStore`, `push*`, `adjustBalance`, `getSellerBalance`, `getBrandingFromStore`, `setBrandingInStore` |
| `seed-block.ts` | Bloqueia login de contas seed (`@darkpay.app/.local/.test`) em prod. | `isSeedEmail`, `seedLoginAllowed`, `checkSeedLogin` |
| `asset-url.ts` | Validador de URL de assets (logo/favicon/banners): aceita `https:` / `data:image/*`, bloqueia IPs privados (SSRF). | `validateAssetUrl`, `UrlValidationResult` |

### 1.2 `src/lib/server/db/` — Acesso a dados (Prisma)

| Arquivo | Propósito | Principais exports |
|---|---|---|
| `seller.service.ts` | Facade que agrega seller-dashboard/finance/transactions. | — |
| `seller-dashboard.service.ts` | Dashboard seller: métricas do período + série de receita por hora/dia (TZ SP) + meta de volume. | `getSellerDashboard(sellerId, period)` |
| `seller-finance.service.ts` | Financeiro seller: lista saques, total pago, taxas e **criação atômica de saque** (debita `balanceAvailable` + cria `Withdrawal` + `BalanceLedger`). | `getSellerFinance`, `createSellerWithdrawalDb` |
| `seller-transactions.service.ts` | Lista paginada de transações + agregados (pendentes/pagos/recusados/reembolsos/ticket/conversão). | `listSellerTransactions` |
| `admin.service.ts` | Facade re-exporta admin-* services. | — |
| `admin-metrics.service.ts` | KPIs globais (users pendentes/bloqueados, docs pendentes, saques, volume, receita plataforma, custo adquirentes) + série de volume + ledger. | `dbAvailable`, `adminPeriodStart`, `getAdminDashboardMetrics`, `getAdminVolumeHistory`, `getAdminLedger` |
| `admin-users.service.ts` | CRUD admin de usuários: métricas, listagem, status, taxas, roteamento, aprova/rejeita docs (dispara `notifyDocReview`), audit. | `getAdminUsersPageMetrics`, `listAdminUsers`, `dbUpdateUserStatus`, `dbUpdateUserFees`, `dbUpdateUserRouting`, `dbSetUserDocumentsStatus`, `listUserDocuments` |
| `admin-acquirers.service.ts` | CRUD admin de adquirentes: status, swap prioridade, set primary (payout/charge), salvar/limpar credenciais. | `listAdminAcquirers`, `getAdminAcquirersMetrics`, `getAcquirerSecrets`, `dbUpdateAcquirerStatus`, `syncAcquirerPrimaryFlags`, `dbSwapAcquirerPriority`, `dbSetAcquirer*`, `dbSaveAcquirerCredentials`, `dbClearAcquirerCredentials` |
| `admin-managers.service.ts` | CRUD admin de gerentes: lista, cria um `Manager` vinculado a `User`, altera status. | `listAdminManagers`, `dbCreateManagerFromUser`, `dbUpdateManagerStatus` |
| `admin-branding.service.ts` | Branding persistido no MySQL (`Branding`+`BrandBanner`) com fallback em memória. | `getBrandingFromDb`, `dbSaveBranding` |
| `admin-withdrawals.service.ts` | Admin de saques: métricas, listagem, finalizações atômicas "pago"/"recusado" (estorna saldo no rejeito). | `getAdminSaquesMetrics`, `listAdminWithdrawals`, `finalizeWithdrawalPaid`, `finalizeWithdrawalFailed`, `dbSetWithdrawalStatus` |
| `api-credentials.service.ts` | **Chaves de API do seller** (sk_live_/sk_test_): hash/encrypt do secret, auth via x-public-key x-secret-key / Bearer, permissões granulares, rotação. | `hashApiSecret`, `secretHint`, `encryptApiSecret`, `decryptApiSecret`, `authenticateApiKey(Detailed)`, `listApiCredentials`, `revealApiCredentialSecret`, `createApiCredential`, `updateApiCredential`, `rotateApiCredential`, `deleteApiCredential`, `hasPermission` |

### 1.3 `src/lib/services/` — Serviços de domínio

| Arquivo | Propósito | Principais exports |
|---|---|---|
| `payment.service.ts` | Facade re-exporta leitura/escrita. | — |
| `payment-read.service.ts` | Busca charge (memória ou `PaymentCharge`) com checagem de posse do `sellerId`. | `getCharge`, `getChargeAsync`, `listCharges`, `listChargesAsync`, `mapPaymentStatus` |
| `payment-write.service.ts` | Criação de cobrança PIX com roteamento por adquirente (`resolveAcquirerForSeller` → PodPay/Velana/Woovi) + fallback mock com QR PNG via `qrcode`. | `CreateChargeInput`, `createPixCharge`, `markChargePaid`, `cancelCharge`, `isPodPayEnabledServer`, `isVelanaEnabledServer` |
| `payment.client.ts` | Re-export limitado para uso client (apenas leitura + mark/cancel). | subset |
| `withdrawal.service.ts` | Snapshot/criação de saque (memory + DB), tratamento de erros de PIX de terceiros. | `isThirdPartyPixRestriction`, `listWithdrawals`, `createWithdrawal`, `setWithdrawalStatus`, `getFinanceSnapshotPreferDb` |
| `finance.service.ts` | ⚠️ **Vazio/legado** — sem exports listados. Padronizar ou remover. | — |

### 1.4 `src/lib/acquirers/` — Adquirentes

Cada adquirente segue o mesmo padrão modular:
`/index.ts` (facade) · `/types.ts` · `/client.ts` (axios) · `/config.ts` · `/mappers.ts` · `/gateway.ts`. Velana ainda tem `/server.ts`.

| Adquirente | Funções principais do gateway |
|---|---|
| **PodPay** | `createChargeViaPodPay`, `createWithdrawalViaPodPay`, `syncBalanceFromPodPay`, `syncChargeFromPodPay`, `applyPodPayWebhook`, `isPodPayEnabledServer`, `resolvePodPayConfigServer` |
| **Velana** | `buildVelanaPixPayload`, `createChargeViaVelana`, `createWithdrawalViaVelana`, `syncBalanceFromVelana`, `syncChargeFromVelana`, `applyVelanaWebhook`, `isVelanaEnabledServer` |
| **Woovi (OpenPix)** | `createChargeViaWoovi`, `createWithdrawalViaWoovi`, `approveWithdrawalViaWoovi`, `syncBalanceFromWoovi`, `syncChargeFromWoovi`, `applyWooviWebhook`, `isWooviReady` |
| **`acquirers/resolve.ts`** | Roteamento: `resolveAcquirerForSeller`, `resolveAcquirerForPayout`, `resolveActiveAcquirer` |

### 1.5 `src/lib/integrations/utmify/`

| Arquivo | Propósito |
|---|---|
| `types.ts` | DTOs da API UTMify. |
| `client.ts` | HTTP — envia `order` (paid/refunded/upsell) para `v1/orders`; helpers UTC e reais→cents. |
| `service.ts` | Token em `IntegrationUtmify`, push de venda em background. `getUtmifyConnection`, `saveUtmifyToken`, `disconnectUtmify`, `testUtmifyConnection`, `pushSaleToUtmify(Background)` |

### 1.6 `src/lib/actions/` — Server Actions

| Arquivo | Ações exportadas |
|---|---|
| `auth.actions.ts` | `loginAction`, `registerAction`, `logoutAction`, `getMeAction` |
| `branding.actions.ts` | `getBrandingAction`, `saveBrandingAction` |
| `notifications.actions.ts` | `getEmailNotificationPrefs`, `updateEmailNotificationPrefs` |
| `payment.actions.ts` | `createPixChargeAction`, `simulatePayAction` |
| `withdrawal.actions.ts` | `createWithdrawalAction` |
| `admin/users.actions.ts` | `updateUserStatusAction`, `updateUserFeesAction`, `updateUserRoutingAction`, `setDocumentsStatusAction` |
| `admin/managers.actions.ts` | `updateManagerStatusAction` |
| `admin/withdrawals.actions.ts` | `setWithdrawalStatusAction` |
| `admin/acquirers.actions.ts` | `updateAcquirerStatusAction`, `swapAcquirerPriorityAction`, `setAcquirerPrimaryAction`, `setAcquirerPayoutPrimaryAction`, `clearAcquirerPayoutPrimaryAction`, `saveAcquirerCredentialsAction`, `clearAcquirerCredentialsAction` |

> ⚠️ **Padrão subutilizado**: as actions existem mas as páginas fazem fetch manual via `authedFetch` em `useEffect`, sem usar `useActionState` (React 19).

### 1.7 Outros helpers estáveis (`src/lib/`)

| Arquivo | Propósito |
|---|---|
| `branding.ts` | Load/save branding em localStorage + favicon dinâmico. |
| `chart-series.ts` | Preenchimento de séries por período (hora/dia). |
| `docs/content.ts` | Conteúdo estático da página `/docs` + URL base da API pública. |
| `domain/types.ts` | Fonte única de tipos PT-BR (`AuthUser`, etc.). |
| `env.ts` | Validação de env via envalid. |
| `format.ts` | Formatadores BRL e datas pt-BR. |
| `kyc.ts` | `buildKyc(status, docs)`. |
| `notifications.ts` | Notificações de venda: toast/som cha-ching/Worker/Emit/Claim via localStorage. |
| `payment-credentials.ts` | Helpers de credenciais de pagamento. |
| `pix-key.ts` | Validação de chave PIX. |
| `security.ts` | Re-export client-safe. |
| `staff.ts` | Permissões de staff: `isStaff`, `rolesIncludeStaff`, `hasStaffPermission`, `permissionForAdminPath`. |
| `timezone.ts` | `America/Sao_Paulo`. |
| `utils.ts` | `cn` + helpers UI. |

---

## 2. Contexts / Providers

### 2.1 Providers em uso

| Provider | Arquivo | Estado gerenciado | API exposta |
|---|---|---|---|
| `QueryProvider` | `src/components/providers/QueryProvider.tsx` | `QueryClient` único (staleTime 30s, retry 1, sem refetchOnFocus). | `useQuery`/`useMutation` do React Query (ainda **não consumidos**). |
| `AuthProvider` | `src/components/auth/AuthProvider.tsx` | `user: AuthUser \| null`, `loading`. No mount chama `/api/v1/auth/me`, instala bug handlers, mostra `BrandLoadingScreen`. Em 401 fora de rota pública → redirect `/login?next=`. | `useAuth()` → `{ user, loading, login, register, logout, refresh, isAdmin, isSuperAdmin, isManager, isSeller }` |
| `BrandingProvider` | `src/components/branding/BrandingProvider.tsx` | `branding: PlatformBranding`. Persiste em localStorage (`darkpay.branding.v4…v1`) + escuta `storage` / evento custom `darkpay:branding` para sincronizar abas. Aplica favicon dinâmico; sem flash SSR. | `useBranding()` → `{ branding, setBranding, updateBranding, resetBranding }` |

### 2.2 Providers montados (atualizado 2026-07-31)

| Provider | Arquivo | Situação |
|---|---|---|
| `SaleNotificationsProvider` | `.../SaleNotificationsProvider.tsx` | ✅ Montado **só** no `RootLayout` (removido dos shells para evitar poll/toast duplicado). |
| `ToastProvider` / `useToast` | `.../ToastProvider.tsx` | ✅ Montado; views ainda migrando de `useState` local. |
| `ImpersonateProvider` / `useImpersonate` | `.../ImpersonateProvider.tsx` | ✅ Montado no root. |

### 2.3 Providers ainda opcionais

| Provider proposto | Motivo |
|---|---|
| `ThemeProvider` | Dark fixo em `<html class="dark">`. Necessário só se houver light mode. |
| `ModalProvider` | Modais admin usam estado local. |
| `RequestIdProvider` | Correlação `X-Request-Id`. |

---

## 3. Hooks personalizados

### 3.1 Hooks existentes

| Hook | Arquivo | Lado | Retorno |
|---|---|---|---|
| `useAuth` | `src/components/auth/AuthProvider.tsx` | Client | `{ user, loading, login, register, logout, refresh, isAdmin, isSuperAdmin, isManager, isSeller }` — fallback seguro se usado fora do provider. |
| `useBranding` | `src/components/branding/BrandingProvider.tsx` | Client | `{ branding, setBranding, updateBranding, resetBranding }` |

### 3.2 Utilitários client (`src/lib/client/`)

| Arquivo | Propósito | Exports |
|---|---|---|
| `session.ts` | `authedFetch` — fetch autenticado por cookie httpOnly + `credentials: include` + header `X-DarkPay-View-Seller` (impersonate). | `authedFetch`, `saveClientToken` (deprecated), `loadClientToken`, `clearClientToken` |
| `bug-report.ts` | Envia bugs do browser (`POST /api/v1/bugs`) com dedupe de 15s; instala handlers globais `error`/`unhandledrejection`. | `reportClientBug`, `installClientBugHandlers` |
| `impersonate.ts` | Modo "visualizar seller": storage em `sessionStorage` key `darkpay.impersonate.seller` + dispatcha `darkpay:impersonate`. | `getImpersonateSeller`, `setImpersonateSeller`, `clearImpersonateSeller`, `isImpersonating`, `VIEW_SELLER_HEADER`, `ImpersonateSeller` |

> 📌 **Não existe diretório `src/hooks/`** nem arquivos `use*.ts` nomeados como hooks além dos dois acima. O projeto **não usa React Query** apesar de instalado — todos os fetches são imperativos (`authedFetch` em `useEffect`), perdendo cache/refetch/invalidation.

### 3.3 Hooks que faltam (propostos)

#### Dados (React Query)
- `useDashboard(period)` → `/api/v1/dashboard`
- `useTransactions(filters)` → `/api/v1/transactions`
- `useSellerFinance()` → `/api/v1/finance`
- `useWithdrawals()` / `useCreateWithdrawal()` → `/api/v1/withdrawals`
- `usePayment(id)` / `useCreatePixCharge()` → `/api/v1/payments`
- `useReconcile()` → `/api/v1/payments/reconcile`
- `useApiCredentials()` / `useRotateApiCredential()` → `/api/v1/api-credentials`
- `useDocuments()` / `useUploadDocument()` → `/api/v1/documents`
- `useAccountProfile()` / `useUpdateProfile()` → `/api/v1/account/profile`
- `useAdminDashboard()`, `useAdminUsers()`, `useAdminWithdrawals()`, `useAdminAcquirers()`, `useAdminManagers()`, `useAdminMetrics()` → `/api/v1/admin/**`
- `useUtmifyIntegration()` → `/api/v1/integrations/utmify`
- `useWebhooks()` → `/api/v1/integracoes` (webhook endpoints)

#### UX / formulário
- `useFormState` / `useActionState` (React 19) — consumir as server actions existentes.
- `useDebounce` / `useDebouncedValue` — busca de transações/usuarios.
- `useCopy` / `useClipboard` — copiar PIX "copia e cola" e chaves de API.
- `useCountdown` — contagem regressiva do QR PIX (15 min).
- `useMediaQuery` / `useIsMobile` — layout responsivo do dash.
- `useConfirm` — diálogo de confirmação para ações destrutivas (estornar, deletar credencial, aprovar/rejeitar saque).

#### Domínio de pagamento
- `usePixCharge(chargeId)` — wrapper `GET /payments/[id]` + polling até `paid`/`expired` + reconcile automático.
- `usePaymentStatus(chargeId)` — streaming de status (poll/SSE).
- `useReconcileOnFocus` — invalida/reconcilia vendas ao refocusar a aba.
- `useSaleSound()` — wrapper para `primeCashRegisterSound`/`unlockNotificationAudio`/`showSaleBrowserNotification`.

#### Admin / observabilidade
- `useAdminPermissions()` — derivado de `useAuth().user.permissions`.
- `useImpersonationBanner()` — banner "você está visualizando a conta de X".
- `useBugReport()` — log de erro com contexto do usuário atual.

---

## 4. Features — Endpoints & Páginas

### 4.1 Endpoints REST `src/app/api/v1/`

**Auth** (`/api/v1/auth/`):
- `POST /login` — login com senha (rate-limited combo/ip/email).
- `POST /login/2fa` — valida challenge TOTP + completa sessão.
- `POST /logout` — apaga sessão.
- `GET /me` — usuário atual enriquecido (2FA/KYC/perms).
- `POST /register` — cria seller pendente + welcome email.
- `GET /2fa` · `POST /2fa` — setup/enable/disable TOTP + backup codes.
- `POST /forgot-password` — anti-enumeração, envia link.
- `POST /reset-password` — consome token, troca senha, invalida sessões.
- `GET /session-check` — ping leve HMAC.

**Conta seller**:
- `GET/PATCH /account/profile` — perfil.
- `GET /documents` · `POST /documents` — upload (UploadThing) + listagem KYC.
- `GET /api-credentials` · `POST /api-credentials` · `PATCH/POST/DELETE /api-credentials/[id]` — gerenciar chaves sk_.
- `GET /branding` · `PUT /branding` — branding do painel.
- `GET /dashboard` · `GET /transactions` · `GET /finance`.
- `GET /withdrawals` · `POST /withdrawals` — solicitar saque.
- `POST /payments` · `GET /payments` — criar cobrança PIX (rota seller).
- `/payments/[id]` (GET) · `/payments/[id]/sync` (GET/POST) · `/payments/[id]/simulate-pay` (POST mock).
- `POST /payments/reconcile` (e GET) — reconcile batch.
- `GET /bugs` · `POST /bugs` — bug reports.
- `GET /acquirers/active` — adquirentes ativos.

**Adquirentes**:
- PodPay: `/acquirers/podpay/{status, balance, transactions, transactions/[id], transactions/[id]/refund, withdrawals, withdrawals/[id], withdrawals/[id]/cancel, checkout/sessions, checkout/sessions/[token], checkout/sessions/[token]/pay, checkout/sessions/[token]/coupon, checkout/payment-links/[publicToken]/sessions}`.
- Velana: `/acquirers/velana/{status, balance, company, checkouts, transactions, transactions/[id], transactions/[id]/refund, transfers, transfers/[id]}`.
- Woovi: `/acquirers/woovi/{status, balance}` (somente leitura — saques via webhook).

**Webhooks**:
- `POST /webhooks/{podpay, velana, woovi}` — verificação HMAC/secret em `hmac.ts`; cada um também expõe `GET` (challenge/health).

**Integrações**:
- `/integrations/utmify` — GET conexão, PUT salvar token, DELETE desconectar, POST testar.

**Admin** (`/api/v1/admin/`):
- `GET /dashboard` · `GET /metrics` — KPIs + série + ledger.
- `GET /users` · `/users/[id]` GET/PATCH — busca user, edita status/taxas/roteamento/docs.
- `GET /sellers` · `GET /saques` · `GET /bugs`.
- `GET /acquirers` · `/acquirers/[id]` GET/PATCH.
- `GET /managers` · `/managers/[id]` PATCH · `POST /managers`.
- `GET /withdrawals` · `/withdrawals/[id]` PATCH — aprovar/rejeitar saque.

**Infra**:
- `/api/health` · `/api/uploadthing/{route, core}`.

### 4.2 Páginas `src/app/**/page.tsx`

| Rota | Renderização |
|---|---|
| `/` | Landing (redireciona conforme sessão). |
| `/dash` | Dashboard do seller (saldo, métricas, gráfico, meta volume, popup de saque). |
| `/login` · `/registro` · `/esqueci-senha` · `/redefinir-senha` | Formulários de auth. |
| `/transacoes` | Tabela paginada de transações do seller + métricas de status. |
| `/financeiro` | Saldo + histórico de saques + solicitar saque. |
| `/financeiro/taxas` | Visualização das taxas MDR/saque da conta. |
| `/configuracoes` | Hub de configurações (client component). |
| `/configuracoes/perfil` | Meu perfil (PJ/PF + avatar). |
| `/configuracoes/seguranca` | 2FA TOTP, backup codes, alteração de senha (QR via `qrcode`). |
| `/configuracoes/documentos` | Upload de docs (UploadThing). |
| `/configuracoes/notificacoes` | Preferências de e-mail + som de venda. |
| `/integracoes` | Hub de integrações. |
| `/integracoes/pagamentos` · `/api` · `/webhooks` · `/podpay` · `/utmify` | Sub-integrações. |
| `/docs` | Documentação pública da API. |
| `/admin` | Dashboard admin (KPIs, volume, ledger). |
| `/admin/usuarios` · `/saques` · `/gerentes` · `/personalizacao` · `/adquirentes` | Sub-painéis admin. |

`src/app/admin/layout.tsx` (server) valida `getSessionUser` + `isStaff` + `permissionForAdminPath` + `hasStaffPermission`, com `x-pathname` injetado pelo middleware `src/proxy.ts`.

### 4.3 Modelos Prisma

`Manager`, `User`, `Session`, `PasswordReset`, `User2FA`, `Document`, `Acquirer`, `UserAcquirer`, `SellerCustomAcquirer`, `Transaction`, `Withdrawal`, `PaymentCharge`, `BalanceLedger`, `MetricDaily`, `PlatformFeePlan`, `Branding`, `BrandBanner`, `ApiCredential`, `WebhookEndpoint`, `WebhookDelivery`, `IntegrationUtmify`, `NotificationSetting`, `SaleNotification`, `AuditLog`, `RateLimit`, `WebhookJob`, `BugLog`.

### 4.4 Middleware de borda — `src/proxy.ts`

`export const proxy` + matcher. Valida o cookie HMAC (`packSessionCookie` do `signed-token.ts`) via Web Crypto em runtime edge: aceita só cookies `body.sig`, rejeita opacos legados, redireciona não autenticados para `/login?next=`, encaminha `x-pathname` para `admin/layout.tsx`. Assets/públicos passam direto.
> ⚠️ O guard de sessão do proxy valida só `exp + HMAC`, não o status real — confirmado por `getUserBySessionToken` em cada request.

---

## 5. Lacunas (GAPS) — o que ainda precisa ser criado

### 5.1 Providers faltando
1. **Montar `SaleNotificationsProvider`** no `RootLayout` (gap imediato — sem ele, cha-ching/polling de venda não funcionam).
2. **`ToastProvider` / `useToast`** — feedback padrão de erro/sucesso/loading.
3. **`ThemeProvider`** — só se light mode for desejado.
4. **`ModalProvider`** — abrir modais por nome/dados (reduz estado local).
5. **`ImpersonateProvider` / `useImpersonate`** — expor `impersonate` via contexto React.
6. **`RequestIdProvider`** — correlação distribuída `X-Request-Id`.

### 5.2 Hooks de dados (React Query ainda não usado)
- Migrar todos os fetches imperativos (`authedFetch` em `useEffect`) para hooks curados: `useDashboard`, `useTransactions`, `useSellerFinance`, `useWithdrawals`, `useCreateWithdrawal`, `usePayment`, `useCreatePixCharge`, `useReconcile`, `useApiCredentials`, `useRotateApiCredential`, `useDocuments`, `useUploadDocument`, `useAccountProfile`, `useUpdateProfile`, `useAdminDashboard`, `useAdminUsers`, `useAdminWithdrawals`, `useAdminAcquirers`, `useAdminManagers`, `useAdminMetrics`, `useUtmifyIntegration`, `useWebhooks`.

### 5.3 Hooks de UX
- `useActionState` para consumir as server actions existentes em `src/lib/actions/**`.
- `useDebounce` · `useClipboard` · `useCountdown` · `useMediaQuery` · `useConfirm`.

### 5.4 Hooks de domínio de pagamento
- `usePixCharge(id)` (polling até paid/expired + reconcile automático).
- `usePaymentStatus(id)` (streaming).
- `useReconcileOnFocus`.
- `useSaleSound`.

### 5.5 Hooks admin / observabilidade
- `useAdminPermissions()` derivado de `useAuth().user.permissions`.
- `useImpersonationBanner()`.
- `useBugReport()`.

### 5.6 Services server-side faltando
- **`auditLog.service.ts`** — helper `audit()` genérico reutilizável (hoje duplicado em `admin-users.service.ts`).
- **`feature-flags.service.ts`** — toggles runtime (CSRF_STRICT, REQUIRE_ADMIN_2FA, ALLOW_MOCK_DATA, ALLOW_SEED_LOGIN, ALLOW_UNSIGNED_WEBHOOKS) sem redeploy.
- **`upload.service.ts`** — validar tipo/tamanho/quota do seller (UploadThing atualmente direto no route).
- **`metrics-rollup.service.ts`** — materializar `MetricDaily` (hoje `getAdminDashboardMetrics` agrega on-the-fly).
- **`webhook-endpoints.service.ts`** — enviar webhooks outbound ao seller (modelos `WebhookEndpoint`/`WebhookDelivery` existem sem service).
- **`webhook-replay.service.ts`** — `replayPendingWebhooks()` (o inbox grava `pending` mas só há `listPendingInbox`).
- **`session-revocation.service.ts`** — endpoint admin "encerrar todas as sessões de um user" (só existe em reset-password).
- **`finance.service.ts`** — remover ou implementar (arquivo vazio).

### 5.7 Resumo do estado

| Item | Situação |
|---|---|
| Auth · 2FA · sessão HMAC · rate limit · balance/ledger | ✅ Em uso |
| 3 adquirentes + webhook fail-closed · UTMify push | ✅ Em uso |
| Dashboard admin/seller · reconcile · bug log · impersonate | ✅ Em uso |
| `@tanstack/react-query` | ⚠️ Instalado, **zero consumo** |
| `SaleNotificationsProvider` | ⚠️ Definido, **não montado** em `layout.tsx` |
| Server actions (`src/lib/actions/**`) | ⚠️ Definidas, **sem `useActionState`** nas páginas |

**Prioridade sugerida de implementação:**
1. Montar `SaleNotificationsProvider` no `RootLayout` (corrige feature quebrada).
2. Criar `ToastProvider` + usar `useActionState` para os server actions.
3. Migrar fetches imperativos para hooks React Query curados.
4. Implementar `auditLog.service.ts` + `feature-flags.service.ts` + `webhook-replay.service.ts`.