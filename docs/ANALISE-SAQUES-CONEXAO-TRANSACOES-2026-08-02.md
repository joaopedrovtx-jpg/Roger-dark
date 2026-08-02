# Análise minuciosa — Saques · Conexão · Transações

**Data:** 2026-08-02  
**Ambiente:** código local + produção `darkpays.online`  
**Escopo:** PIX out (saque), roteamento/credenciais de adquirentes, cobranças e webhooks

---

## 1. Mapa dos fluxos

### 1.1 Saque (seller)

```
POST /api/v1/withdrawals
  → createWithdrawal()
    → resolveAcquirerForPayout()  // white global isPayoutPrimary
    → debitAvailableBalance (bruto)
    → createWithdrawalVia{Velana|PodPay|Woovi}(líquido)
    → persistWithdrawalDb
    → status processando | pago | fila manual
  ← webhook transfer → finalizeWithdrawalPaid/Failed
```

### 1.2 Cobrança (seller)

```
POST /api/v1/payments
  → resolveAcquirerForSeller()
  → createChargeVia*
  → TX pendente + charge waiting_payment + balancePending++
  ← webhook paid → creditPaidSaleIdempotent
  ← TTL 15m → abandonada + pending--
  ← late pay (abandonada) → credit só available
```

### 1.3 Conexão

| Provider | Credenciais | Status probe | Payout white |
|----------|-------------|--------------|--------------|
| Velana | Admin DB sk_ + env | balance live | isPayoutPrimary |
| PodPay | Admin DB / env / header | **antes:** echo; **agora:** probe | isPayoutPrimary |
| Woovi | Admin AppID | account live | isPayoutPrimary |

---

## 2. Bugs encontrados e estado

| ID | Sev | Área | Problema | Fix |
|----|-----|------|----------|-----|
| W1 | P0 | Saque | Velana/PodPay sucesso `processando` caía em throw genérico + estorno | `return recorded` (já em prod `4ff8eac`) |
| B1 | P0 | Saldo | Crédito após `abandonada` decrementava pending de outras vendas | Branch por `prevStatus` |
| B2 | P0 | Saldo | Reject zerava **todo** pending do seller | Só `min(amount, pending)` |
| WH1 | P0 | Webhook PodPay | Paid sem TX → 200 silencioso | Throw → 503 retry |
| WH2 | P0 | Webhook Velana | `signedOk` sempre true (reconfirm morto) | `signedOk = sigCheck.signed` |
| WH3 | P1 | Webhook Velana | HMAC fail-closed vs Velana unsigned | Aceita unsigned + reconfirm obrigatório |
| TX1 | P1 | IDs | `TX-VL/PP-${Date.now().slice(-8)}` colisão | `randomBytes(8)` |
| R1 | P0 | Rota | `preferredAdquirenteId` forçava personalizado com mode plataforma | Só se `routingMode=personalizado` |
| R2 | P1 | Rota | Preferência ignorava enabled/status | Filtros `enabled`+`ativo` |
| R3 | P1 | Rota | Ghost provider sem row no DB | Removido |
| R6 | P1 | Rota | `sk_*` → podpay (Velana usa sk_) | Removido detect por prefixo |
| C4 | P1 | PodPay | Config DB ignorava `enabled` | `enabled: true` |
| S1 | P0 | PodPay status | Não lia DB nem probe | `resolvePodPayConfigServer` + balance |
| S2 | P1 | Active | Lista sem Woovi | Inclui woovi/openpix |
| RC1 | P1 | Reconcile | Só `waiting_payment` | + `expired` |
| RC2 | P2 | UI list | limit 6 | 20 pagamentos / 15 saques |
| WX1 | P2 | Woovi map | MOVEMENT_CONFIRMED → venda | Removido do map de charge |

---

## 3. Correções neste pacote (commit)

Arquivos principais:

- `src/lib/server/balance.ts`
- `src/lib/server/hmac.ts`
- `src/app/api/v1/webhooks/velana/route.ts`
- `src/app/api/v1/webhooks/podpay/route.ts`
- `src/lib/acquirers/resolve.ts`
- `src/lib/acquirers/velana/gateway.ts` / `podpay/gateway.ts` (TX ids)
- `src/lib/acquirers/podpay/config.ts`
- `src/app/api/v1/acquirers/podpay/{status,balance}/route.ts`
- `src/app/api/v1/acquirers/active/route.ts`
- `src/lib/server/reconcile-payments.ts`
- `src/app/api/v1/transactions/route.ts`
- `src/lib/acquirers/woovi/mappers.ts`
- `src/lib/services/withdrawal.service.ts` (comentários alinhados)

---

## 4. Continuação (2026-08-02, commits seguintes)

| Item | Estado |
|------|--------|
| Chargeback → `reembolsada` → refund | ✅ mappers Velana/PodPay + event chargeback |
| PodPay idempotency + netPayout false | ✅ |
| Local SQ- id Velana/PodPay + debit referenceId | ✅ |
| Memory adjustBalance só se DB off (Velana webhook) | ✅ |
| Expire resolve TX real (não charge id) | ✅ |
| Schema saque amount finito/max/decimais | ✅ |
| Encrypt secrets de `acquirers` no DB | ⏳ backlog |
| Cron reconcile global | ⏳ ops |

---

## 5. Checklist operacional pós-deploy

1. Saque Velana com saldo na white → deve retornar **processando** (não erro genérico).  
2. Mensagens reais da Velana (saldo, CPF, IP) devem aparecer se a API rejeitar.  
3. Admin → Adquirentes → PodPay status deve refletir key do Admin e probe.  
4. Seller com `routingMode=plataforma` e pref stale → usa #1 plataforma.  
5. Webhook Velana sem HMAC → processa se reconfirm API ok.

---

*Varredura via código + logs VPS + subagentes explore (saques, webhooks, conexão).*
