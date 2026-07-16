# Integração PodPay → DarkPay

**Docs oficiais:** https://docs.podpay.app/  
**OpenAPI:** https://docs.podpay.app/podpay-api/openapi.json

## Ambientes

| Env | Base URL | Key |
|-----|----------|-----|
| Sandbox | `https://sandbox.podpay.app` | `sk_test_…` |
| Live | `https://api.podpay.app` | `sk_live_…` |

Auth: header **`x-api-key`**.

## UI hub `/integracoes/podpay`

Todas as áreas da documentação em abas:

| Aba | Endpoints PodPay |
|-----|------------------|
| **Credenciais** | `x-api-key` sandbox/live |
| **Saldo** | `GET /v1/balance/available` |
| **Pagamentos** | `POST/GET /v1/transactions`, `GET …/{id}`, `POST …/{id}/refund` |
| **Saques** | `POST/GET /v1/withdrawals`, `GET …/{id}`, `PATCH …/{id}/cancel` |
| **Checkout** | sessions, coupon, pay, payment-links |
| **Webhooks** | `transaction.*` / `withdrawal.*` → `/api/v1/webhooks/podpay` |

A chave salva no painel é enviada ao BFF via header `x-podpay-api-key` (funciona sem `PODPAY_API_KEY` no `.env`).

## Endpoints usados

| PodPay | Uso DarkPay |
|--------|-------------|
| `POST /v1/transactions` | Criar cobrança PIX |
| `GET /v1/transactions` | Listar vendas remotas |
| `GET /v1/transactions/{id}` | Consultar venda |
| `POST /v1/transactions/{id}/refund` | Estorno |
| `POST /v1/withdrawals` | Saque PIX (fiat) |
| `GET /v1/withdrawals` | Listar saques remotos |
| `GET /v1/withdrawals/{id}` | Consultar saque |
| `PATCH /v1/withdrawals/{id}/cancel` | Cancelar saque |
| `GET /v1/balance/available` | Saldo (amount / waitingFunds / reserve / maxAntecipable) |
| `POST /v1/checkout/sessions` | Checkout hospedado |
| `GET /v1/checkout/sessions/{token}` | Sessão pública |
| `POST /v1/checkout/sessions/{token}/coupon` | Cupom |
| `POST /v1/checkout/sessions/{token}/pay` | PIX no checkout |
| `POST /v1/checkout/payment-links/{token}/sessions` | Abrir link de pagamento |
| Webhooks `transaction.*` / `withdrawal.*` | `POST /api/v1/webhooks/podpay` |

## Regras importantes

1. **Valores em centavos** (R$ 100 = `10000`)
2. **Idempotência** com `X-Idempotency-Key` em creates
3. Resposta envelope: `{ success, data, meta }`
4. Status TX: PENDING → PAID / FAILED / REFUNDED…
5. Status saque: pending → processing → completed | failed | canceled

## Mapeamento status

| PodPay TX | DarkPay |
|-----------|---------|
| PENDING / PROCESSING | pendente |
| PAID | aprovada |
| REFUNDED | reembolsada |
| FAILED / CANCELED / BLOCKED / CHARGEBACK | recusada |

| PodPay saque | DarkPay |
|--------------|---------|
| pending / pending_approval / processing | processando |
| completed | pago |
| failed / canceled | recusado |

| PodPay saldo | DarkPay |
|--------------|---------|
| amount | available |
| waitingFunds | pending |
| reserve | held |

## Código DarkPay

```
src/lib/acquirers/podpay/
  client.ts      # HTTP x-api-key + checkout + saques
  config.ts      # env + localStorage + header BFF
  mappers.ts     # cents / status / pix key type
  gateway.ts     # create charge/withdrawal + webhook apply
  types.ts
  index.ts

src/app/api/v1/webhooks/podpay
src/app/api/v1/acquirers/podpay/
  status | balance
  transactions | transactions/[id] | …/refund
  withdrawals | withdrawals/[id] | …/cancel
  checkout/sessions | …/pay | …/coupon | payment-links/…/sessions
src/app/integracoes/podpay  # hub UI completo
```

## Fluxo com chave

1. Salvar chave em Integrações → PodPay (ou `PODPAY_API_KEY` no `.env`)
2. Aba **Pagamentos** → `POST /v1/transactions` (PIX)
3. Webhook PodPay → `/api/v1/webhooks/podpay` → atualiza TX + saldo
4. Aba **Saques** → `POST /v1/withdrawals` (method=fiat)
5. Aba **Checkout** → sessions / coupon / pay / payment-links
6. Aba **Saldo** → `GET /v1/balance/available`

## Sem chave

Continua **mock local** (memory-store) para desenvolvimento nos fluxos seller (dashboard/financeiro).

## Banco de dados (MySQL)

Schema SQL completo: **`darkpay.sql`** (raiz do projeto).  
Prisma espelhado em `prisma/schema.prisma` (`provider = "mysql"`).

```bash
# cria database + tabelas + seeds
mysql -u root -p < darkpay.sql

# .env
DATABASE_URL=mysql://user:senha@localhost:3306/darkpay

npm install
npx prisma generate
```

Client: `src/lib/server/prisma.ts` (`isDatabaseConfigured()`).
