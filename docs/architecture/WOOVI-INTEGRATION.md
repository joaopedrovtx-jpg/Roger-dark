# Integração Woovi → DarkPay

**Docs:** https://app.woovi.com/home/applications/tab/doc  
**AppID:** https://app.woovi.com/home/applications  

## Auth (oficial) — só AppID

```bash
curl --request GET \
  --url https://api.woovi.com/api/v1/charge \
  --header 'Authorization: SEU_APPID_AQUI'
```

- **Não** usa chave pública + secreta  
- Header: `Authorization: <AppID>`  
- Base prod: `https://api.woovi.com`  
- Sandbox: `https://api.woovi-sandbox.com`  

No DarkPay: **Admin → Adquirentes → Credenciais → Woovi → campo AppID**.

## Fluxo PIX

```
Checkout / oferta (sk_ do seller)
  → POST /api/v1/payments
  → createChargeViaWoovi()
  → POST https://api.woovi.com/api/v1/charge
       Authorization: AppID
       body: correlationID, value (centavos), comment:"Pagamento", customer
  ← brCode + qrCodeImage
  → webhook OPENPIX:CHARGE_COMPLETED → /api/v1/webhooks/woovi
```

### Payload que enviamos (estável, sem título da oferta)

```json
{
  "correlationID": "dp_usrxxx_abc123",
  "value": 1990,
  "comment": "Pagamento",
  "expiresIn": 1800,
  "customer": {
    "name": "Cliente",
    "email": "cliente@email.com",
    "phone": "5511999999999",
    "taxID": "52998224725"
  }
}
```

**Importante:** o `comment` é **sempre** `"Pagamento"`.  
Título da oferta (com emoji etc.) fica só no DarkPay e **não** vai para a Woovi  
(a API rejeita emoji no comentário).

## Erros no checkout (API pública)

A resposta de erro para integração (`api_key`) **não expõe** nome da adquirente:

```json
{
  "error": {
    "code": "payment_error",
    "message": "Erro no app de pagamento. Tente novamente em instantes."
  }
}
```

Detalhes (Woovi, AppID, emoji, etc.) ficam só no log do servidor (`payment_create_failed`).

## Webhook

```
https://darkpays.online/api/v1/webhooks/woovi
```

Eventos: `OPENPIX:CHARGE_COMPLETED`, `OPENPIX:CHARGE_EXPIRED`.

**Importante:** o evento `CHARGE_COMPLETED` **força** status `aprovada` no DarkPay  
(mesmo se `charge.status` vier `ACTIVE` no payload). A venda é creditada via  
`creditPaidSaleIdempotent` (idempotente).

## Sync / reconcile (fallback se webhook falhar)

- `POST /api/v1/payments/:id/sync` — consulta GET `/api/v1/charge/:correlationID` na Woovi  
  e marca `aprovada` + credita saldo se `status=COMPLETED`.
- A tela **Transações** re-sincroniza PIX pendentes automaticamente (poll).
- `reconcilePendingPayments` também cobre provider `woovi`.

## Rotas DarkPay

| Método | Path |
|--------|------|
| GET | `/api/v1/acquirers/woovi/status` |
| GET | `/api/v1/acquirers/woovi/balance` |
| POST | `/api/v1/webhooks/woovi` |
| POST | `/api/v1/payments` |
| POST | `/api/v1/payments/:id/sync` |

## Checklist

1. app.woovi.com → API/Plugins → criar App **tipo API** → copiar AppID  
2. Admin DarkPay → Credenciais → Woovi → colar AppID → Salvar  
3. Definir prioridade (#1 se for principal)  
4. Webhook: `https://darkpays.online/api/v1/webhooks/woovi`  
5. Testar checkout  

## Código

```
src/lib/acquirers/woovi/
  types.ts config.ts client.ts mappers.ts gateway.ts index.ts
src/app/api/v1/acquirers/woovi/status|balance
src/app/api/v1/webhooks/woovi
```
