# Integração completa Velana → DarkPay

**Docs:** https://velana.readme.io/reference/introducao  
**Credenciais:** https://app.velana.com.br/settings/credentials

## Arquitetura

```
Seller (API sk_ DarkPay ou sessão)
  → DarkPay /api/v1/payments
    → resolveActiveAcquirer()  [Velana primária]
      → POST https://api.velana.com.br/v1/transactions
         Authorization: Basic base64("{SECRET_KEY}:x")
  ← PIX (qrcode + copia-e-cola)
  → postback Velana → POST /api/v1/webhooks/velana
  → sync manual: POST /api/v1/payments/:id/sync
```

## Auth (oficial)

```
Authorization: Basic base64("{SECRET_KEY}:x")
```

- **Secret (sk_)** → username do Basic  
- Password literal **`x`**  
- **Public (pk_)** → salva no Admin (tokenização cartão); PIX server-side usa só a secret

## Rota principal

Tabela `acquirers`:

| id | code | isPrimary | priority | feeFixed (custo) |
|----|------|-----------|----------|------------------|
| velana | VELANA | **true** | 1 | R$ 0,80 |
| podpay | PODPAY | false | 2 | … |

Seller fee padrão Velana: **2,99% + R$ 1,00**.

## Endpoints BFF DarkPay

| Método | Path | Velana |
|--------|------|--------|
| GET | `/api/v1/acquirers/velana/status` | valida secret (balance) |
| GET | `/api/v1/acquirers/velana/balance` | `GET /balance/available` |
| GET | `/api/v1/acquirers/velana/company` | `GET /company` |
| POST/GET | `/api/v1/acquirers/velana/transactions` | criar/listar PIX |
| GET | `/api/v1/acquirers/velana/transactions/:id` | buscar TX |
| POST | `/api/v1/acquirers/velana/transactions/:id/refund` | estorno |
| POST | `/api/v1/acquirers/velana/transfers` | saque PIX |
| GET | `/api/v1/acquirers/velana/transfers/:id` | buscar saque |
| POST | `/api/v1/acquirers/velana/checkouts` | checkout hospedado |
| POST | `/api/v1/webhooks/velana` | postbacks |
| POST | `/api/v1/payments` | cobrança seller (intermediação) |
| POST | `/api/v1/payments/:id/sync` | consulta status real |

## Payload PIX (criar transação)

```json
{
  "amount": 9700,
  "paymentMethod": "pix",
  "customer": {
    "name": "Cliente",
    "email": "cliente@email.com",
    "phone": "11999999999",
    "document": { "type": "cpf", "number": "52998224725" }
  },
  "items": [
    { "title": "Pedido", "unitPrice": 9700, "quantity": 1, "tangible": false }
  ],
  "pix": { "expiresInDays": 1 },
  "postbackUrl": "https://SEU_DOMINIO/api/v1/webhooks/velana",
  "metadata": "seller=usr_01|desc=Pedido",
  "traceable": false
}
```

Resposta: `pix.qrcode` (EMV), `pix.url`, `pix.expirationDate`, `status`.

## Postbacks

Configure URL pública:

```env
NEXT_PUBLIC_APP_URL=https://seu-dominio.com
# ou
VELANA_POSTBACK_BASE_URL=https://seu-dominio.com
```

Payload: `{ "type": "transaction"|"checkout"|"transfer", "data": { ... } }`

## Código

```
src/lib/acquirers/velana/
  types.ts client.ts config.ts mappers.ts gateway.ts server.ts index.ts
src/app/api/v1/acquirers/velana/**
src/app/api/v1/webhooks/velana/route.ts
src/lib/acquirers/resolve.ts
src/lib/services/payment.service.ts
src/lib/services/finance.service.ts
```

## Checklist operacional

1. Admin → Credenciais → Velana: colar **pk_** + **sk_**
2. Marcar principal / priority 1
3. **Testar API** (balance)
4. Definir `NEXT_PUBLIC_APP_URL` pública para webhook
5. Em localhost: use **Verificar pagamento** (`/payments/:id/sync`)
