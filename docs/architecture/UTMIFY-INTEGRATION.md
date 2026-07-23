# Integração UTMify × Dark Pay

**Site:** https://utmify.com.br / https://app.utmify.com.br  
**Docs oficiais:** https://docs.utmify.com.br/envio-de-vendas  

## Objetivo

Enviar vendas PIX do Dark Pay para a UTMify (tracking server-side), para a UTMify atribuir conversões a campanhas **Meta Ads / Pixel / Google** com base em UTMs.

## Fluxo do seller

1. Conta em [app.utmify.com.br](https://app.utmify.com.br/register)
2. **Integrações → Webhooks → Credenciais de API → Adicionar Credencial**
3. Copia o **API Token**
4. Dark Pay → **Integrações → UTMify** → cola o token → **Conectar**
5. (Na UTMify) configura Pixel/Meta Ads nas integrações de anúncio
6. Dark Pay envia automaticamente:
   - PIX gerado → `status: waiting_payment`
   - PIX pago → `status: paid` (mesmo `orderId`)

## API UTMify

```
POST https://api.utmify.com.br/api-credentials/orders
Header: x-api-token: <token>
```

Payload (resumo):

| Campo | Valor Dark Pay |
|-------|----------------|
| platform | `DarkPay` |
| paymentMethod | `pix` |
| status | `waiting_payment` \| `paid` \| `refused` \| `refunded` |
| createdAt / approvedDate | UTC `YYYY-MM-DD HH:MM:SS` |
| commission | centavos (total, fee, líquido seller) |
| trackingParameters | UTMs do `metadata` da cobrança |

## Código no Dark Pay

| Peça | Caminho |
|------|---------|
| Cliente HTTP | `src/lib/integrations/utmify/client.ts` |
| Token + push | `src/lib/integrations/utmify/service.ts` |
| API seller | `src/app/api/v1/integrations/utmify/route.ts` |
| UI | `src/components/integracoes/UtmifyView.tsx` |
| Disparo create PIX | `src/app/api/v1/payments/route.ts` |
| Disparo pago | `creditPaidSaleIdempotent` + PodPay/Velana webhooks |
| DB | `integration_utmify` (`apiToken`, `active`) |

## UTMs (Pixel / campanhas)

Ao criar cobrança, envie no body:

```json
{
  "amount": 97,
  "description": "Produto X",
  "metadata": {
    "utm_source": "FB",
    "utm_campaign": "CAMPANHA|123",
    "utm_medium": "CONJUNTO|456",
    "utm_content": "AD|789",
    "utm_term": "Instagram_Feed"
  }
}
```

Checkout/landing que abre o PIX deve repassar as UTMs da URL no `metadata`.

## Pixel

O **Pixel do Meta** não fica no Dark Pay: fica na **UTMify** (e/ou no site de vendas).  
O Dark Pay só **empurra as vendas** para a UTMify, que faz a atribuição.

## Teste

- Botão **Testar token** → `isTest: true` na API UTMify (valida, não grava venda).
- Depois de conectar, gere um PIX real e confira o **Resumo** na UTMify.
