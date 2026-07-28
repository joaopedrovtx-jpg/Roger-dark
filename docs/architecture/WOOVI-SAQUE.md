# Woovi — fluxo de saque (PIX out)

Docs oficiais:
- [Criar pagamento](https://developers.woovi.com/en/docs/payment/payment-how-to-use-api-to-create)
- [Auto-approve](https://developers.woovi.com/en/docs/payment/payment-how-to-auto-approve)
- [Idempotência / correlationID](https://developers.woovi.com/en/docs/payment/payment-idempotency)
- [Webhook payment](https://developers.woovi.com/en/docs/webhook/examples/webhook-payment-payload)
- [Ativar PIX out](https://ajuda.woovi.com/hc/duvidas-frequentes/articles/como-ativar-o-pix-out-pagamento-externo)

## Pré-requisito na conta Woovi

**PIX out / pagamentos externos** precisa estar habilitado na empresa.  
Sem isso a API responde `403 Pagamentos externos não estão habilitados`.

AppID: Admin DarkPay → Adquirentes → Woovi → privateKey = AppID  
Header: `Authorization: <AppID>`

## Fluxo DarkPay

```
Seller (Financeiro → Saque)
  → debita saldo DarkPay (bruto)
  → POST https://api.woovi.com/api/v1/payment
       {
         value: <líquido em centavos>,
         destinationAlias,
         destinationAliasType: CPF|CNPJ|EMAIL|PHONE|RANDOM,
         correlationID: "wd_SQ-xxxx",
         comment: "Pagamento"
         [+ autoApprove:true se saqueAutomatico do seller]
       }
  → status CREATED/APPROVED na Woovi (= processando no DarkPay)
  → seller SEMPRE vê "processando" até o webhook

Admin (Dashboard → Saques → Aprovar)  OU  saqueAutomatico=true
  → se já existe CREATED: POST /api/v1/payment/approve { correlationID }
  → se pending_manual: POST /api/v1/payment com autoApprove:true
  → NÃO marca "pago" se a adquirente ainda estiver pendente
  → seller continua vendo pendente

Webhook (fonte da verdade da liquidação)
  OPENPIX:MOVEMENT_CONFIRMED → status pago + ledger/taxa
  OPENPIX:MOVEMENT_FAILED    → recusado + devolve saldo
```

## Saque automático (por seller)

Toggle em **Admin → Usuários → Saque automático**.

- Ativo: cada saque daquela conta dispara a aprovação do painel sozinho
  (equivale a clicar Aprovar em todos os saques daquele seller).
- Status pro seller continua pendente até `MOVEMENT_CONFIRMED`.
- Inativo: saque fica na fila do admin até alguém clicar Aprovar.

## Webhook a configurar na Woovi

```
https://darkpays.online/api/v1/webhooks/woovi
```

Eventos:
- `OPENPIX:CHARGE_COMPLETED` (vendas)
- `OPENPIX:MOVEMENT_CONFIRMED` (saque ok)
- `OPENPIX:MOVEMENT_FAILED` (saque falhou)

## Botões no Admin

| Botão | Ação |
|-------|------|
| **Aprovar e pagar na adquirente** | Chama approve/create na Woovi |
| **Marcar pago (manual)** | Só DarkPay (você já pagou fora) |
| **Recusar** | Devolve saldo ao seller |

## correlationID

Sempre estável por saque: `wd_SQ-<hex>`.  
Reusar em retries (não gerar ID novo a cada tentativa).
