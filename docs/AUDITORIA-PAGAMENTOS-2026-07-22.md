# Auditoria completa — Pagamentos, Adquirentes e Plataforma

**Data:** 2026-07-22  
**Ambiente:** produção `darkpays.online` (VPS) + código local  
**Método:** análise de código (3 agentes) + testes de integridade no banco/API em produção  
**Foco do incidente:** PIX pago real às 21/07/2026 22:44 não marcava como pago

---

## 1. Resumo executivo

| Área | Estado geral |
|------|----------------|
| Health / DB | OK |
| Criar cobrança PIX (Velana) | OK |
| Marcar pago (webhook) | **Corrigido agora** (antes 401) |
| Consistência charge ↔ transaction | OK (0 mismatches) |
| Saldos seller principal | OK com 1 venda paga |
| Webhooks seller (UI) | **Mock localStorage — não funciona de verdade** |
| Admin com mock/fallback | **Risco alto** |
| Testes automatizados de pagamento | **Inexistentes** |

**Causa raiz do bug que você sentiu:**  
A Velana **enviou** o postback quando você pagou (`POST /api/v1/webhooks/velana`), mas o DarkPay respondia **401** porque exigia assinatura HMAC (`x-velana-signature`). A documentação da Velana **não assina** postbacks. O pagamento ficou `paid` na Velana e `pendente` no DarkPay até sync manual/correção.

**Por que “já tinha corrigido antes” e voltou a falhar:**  
Correções parciais (UI, sync, crédito) não atacavam o **401 no webhook**. Qualquer deploy que reintroduza “HMAC obrigatório em prod” sem a Velana assinar **quebra de novo** o fluxo automático.

---

## 2. Fluxo de recebimento (como deveria funcionar)

```
Seller cria PIX
  POST /api/v1/payments
    → resolve adquirente (Velana primária)
    → POST api.velana.com.br/v1/transactions (+ postbackUrl)
    → grava Transaction (pendente) + PaymentCharge (waiting_payment)
    → User.balancePending += valor

Cliente paga PIX na Velana
  → Velana POST https://darkpays.online/api/v1/webhooks/velana
  → DarkPay valida / processa
  → creditPaidSaleIdempotent:
        Transaction: pendente → aprovada
        Charge: waiting_payment → paid
        balancePending -= bruto
        balanceAvailable += líquido (bruto - taxa)
        BalanceLedger credit_sale
  → (opcional) UTMify paid

Caminhos alternativos de confirmação:
  • POST /api/v1/payments/:id/sync  (painel Pagamentos / Transações)
  • Polling na UI a cada ~8–12s
```

### Status (dois vocabulários)

| Camada | Pendente | Pago | Recusado | Reembolso |
|--------|----------|------|----------|-----------|
| **Transaction** (UI Transações) | `pendente` | `aprovada` (“Pago”) | `recusada` | `reembolsada` |
| **PaymentCharge** | `waiting_payment` | `paid` | `cancelled` | `refunded` |

---

## 3. Incidente 21/07/2026 22:44 (transação real)

| Campo | Valor |
|--------|--------|
| ID | `TX-VL-84652988` |
| Velana | `133896466` |
| Criada | 21/07/2026 22:44:12 BRT |
| Paga na Velana | 21/07/2026 22:45:19 BRT |
| Marcada no DarkPay | ~22:48 (sync/manual pós-falha webhook) |
| Valor | R$ 9,90 · taxa R$ 1,30 · líquido **R$ 8,60** |
| Nginx | `POST /api/v1/webhooks/velana` → **401** (01:45 e 01:50 UTC) |

**Estado atual (teste prod 2026-07-22):**  
1 aprovada · 36 pendentes · 0 cobrança paga ainda pendente na Velana · saldos consistentes com a venda paga.

---

## 4. Testes executados em produção (smoke)

| # | Check | Resultado |
|---|--------|-----------|
| 1 | `/api/health` | OK |
| 2 | Webhook Velana **sem** assinatura | **200** (após fix; antes 401) |
| 3 | Contagens Transaction / Charge | 1 paid / 36 waiting |
| 4 | Consistência charge↔tx | **0 mismatches** |
| 5 | 15 pendentes locais vs API Velana | **0** ainda pagos remotamente |
| 6 | Rotas seller sem auth | 401 |
| 7 | `simulate-pay` | não libera pagamento real (CSRF/mock) |
| 8 | Velana live + sk/pk no Admin | OK |
| 9 | PodPay sem chaves em prod | sandbox/desabilitado efetivo |

---

## 5. Achados P0 (críticos — dinheiro / confiabilidade)

### P0-A — Webhook Velana rejeitava postback (CORRIGIDO 22/07)

- **Antes:** assinatura obrigatória → 401  
- **Agora:** sem assinatura aceita; se status `paid`, **reconfirma na API Velana** antes de creditar  
- **Arquivo:** `src/app/api/v1/webhooks/velana/route.ts`  
- **Risco residual:** se alguém reintroduzir HMAC obrigatório sem a Velana assinar, o bug volta

### P0-B — Cancelamento/reembolso/transfer Velana **sem** confirmação API

- Postback **unsigned** com `status: refused` / transfer pode alterar DB se souber o `providerId`  
- Não passa por `confirmPaidOnVelana`  
- **Risco:** cancelar pendente falso → PIX real depois **não credita** (CAS só credita se ainda `pendente`)

### P0-C — Persistência da cobrança não é atômica com a Velana

- Velana cria PIX → se MySQL falhar, API ainda pode devolver sucesso  
- Webhook depois: `tx not found` → silêncio, cliente pagou e DarkPay não tem venda

### P0-D — Recusa/reembolso decrementa `balancePending` sem CAS confiável

- Race: dois webhooks de recusa / recusa vs pago → pending negativo  
- Padrão correto existe só em `creditPaidSaleIdempotent` (pago)

### P0-E — Reembolso **depois** de `aprovada` não estorna `balanceAvailable`

- Chargeback/reembolso na adquirente não debita saldo já creditado

### P0-F — Webhooks do seller (página Integrações → Webhooks)

- **Só localStorage** — não grava no servidor, **não dispara** eventos reais  
- Funcionalidade aparente, zero entrega

---

## 6. Achados P1 (altos)

| ID | Problema | Onde |
|----|----------|------|
| P1-1 | Confirm Velana falha e mesmo assim responde 200 (adquirente para de reenviar) | webhook velana |
| P1-2 | MDR do seller (`mdrPercent`/`mdrFixed`) ignorado na criação (usa fee padrão) | gateways |
| P1-3 | Admin Usuários: seed com **mock** se API vazia; status/fees otimistas sem `res.ok` | AdminUsuariosView |
| P1-4 | Admin Saques: fallback **mock** em erro | AdminSaquesView |
| P1-5 | Admin Adquirentes: métricas de período **escaladas/fake** | AdminAdquirentesView |
| P1-6 | Dashboard: Sacar sem reload de saldo + taxa default 3% | KpiGrid |
| P1-7 | Financeiro: erro de load zera saldos (parece conta vazia) | FinanceiroOverview |
| P1-8 | Manager tem poder de admin em rotas sensíveis (secrets/saques) | guards `requireAdmin` |
| P1-9 | Sem rate limit em payments/webhooks/sync | security.ts |
| P1-10 | Poll agressivo Transações + Pagamentos (carga na Velana) | UI |
| P1-11 | IP allowlist da API só no browser (não enforce server) | ApiIntegracaoView |

---

## 7. Achados P2 (médios / UX)

- Labels: seller **Pago** vs admin **Aprovado**  
- Gráficos usam dia local do browser, não só `America/Sao_Paulo`  
- Transações sem paginação (max 100)  
- PodPay hub: chave em memória some no refresh  
- Docs/SECURITY-HARDENING desatualizados vs webhook Velana atual  
- Sem suite de testes unitários/integração de pagamento (`npm test` inexistente)

---

## 8. O que está funcionando bem

1. **Crédito de venda paga** via `creditPaidSaleIdempotent` (idempotente, ledger)  
2. **Sync manual** `/payments/:id/sync`  
3. **Auto-sync** na página Transações (após correção recente)  
4. **PodPay webhook** HMAC fail-closed  
5. **simulate-pay** bloqueado em production  
6. **Auth** nas rotas seller (401 sem sessão)  
7. **Timezone** `formatDateTime` → Brasília  
8. **Saldo retido** no Financeiro (não mais “aguardando PIX”)  
9. **Seller pendente** não cria cobrança  
10. Débito de saque com check `balanceAvailable >= amount`

---

## 9. Matriz por página / função

| Página | Backend real? | Principal risco |
|--------|---------------|-----------------|
| Dashboard | Sim | Saque sem refresh; taxa 3% fixa no modal |
| Transações | Sim + sync | Poll; 100 itens; status depende webhook/sync |
| Financeiro | Sim | Erro = zeros; sem poll saque |
| Pagamentos (API PIX) | Sim | OK; poll 8s |
| API credenciais | Sim | IPs fake (local) |
| UTMify | Sim | OK básico |
| Webhooks seller | **Não** | Mock total |
| PodPay hub | Parcial | Chave não persiste |
| Admin Dashboard | Sim | Poll 5s pesado |
| Admin Usuários | Sim + mock | Mock em empty/erro |
| Admin Saques | Sim + mock | Mock em erro |
| Admin Adquirentes | Sim + fake KPIs | Métricas enganosas |
| Admin Gerentes | Sim | Status sem checar ok |
| Personalização | Local + API frouxa | “sucesso” mesmo se API falhar |
| Notificações | Local | Preferências por device |

---

## 10. Plano de correção recomendado (ordem)

### Sprint A — nunca mais “paguei e não marcou” (1–2 dias)

1. ~~Webhook Velana 401~~ **feito**  
2. Confirmar na API Velana **todo** status que mexe dinheiro (recusa/reembolso/transfer), não só paid  
3. Se confirm paid falhar → **503** (forçar retry da Velana), não 200  
4. Job de reconciliação: a cada N min, lista `waiting_payment` e sync com adquirente  
5. Teste e2e: criar PIX mock/sandbox → paid webhook → assert saldo  

### Sprint B — integridade financeira (2–3 dias)

6. Recusa/reembolso com CAS (`updateMany.count === 1`)  
7. `refundPaidSaleIdempotent` (estorno de available)  
8. Create charge em `$transaction` Prisma; falha DB = não 201  
9. Usar MDR do seller no fee  

### Sprint C — plataforma / admin (3–5 dias)

10. Remover mocks em produção nas telas admin  
11. Webhooks seller de verdade **ou** esconder/desabilitar UI  
12. RBAC fino (manager ≠ full admin secrets)  
13. Rate limit payments/webhooks  
14. Dashboard saque = mesmo fee + reload do Financeiro  

---

## 11. Checklist operacional (hoje)

- [x] Postback URL pública com `APP_URL`  
- [x] Velana sk/pk no Admin (live)  
- [x] Webhook não retorna 401 sem assinatura  
- [ ] Reconciliação automática agendada  
- [ ] Alerta (log/Slack) se webhook paid e confirm falhar  
- [ ] Smoke pós-deploy: `curl` postback fake + 1 sync real  
- [ ] Documentação SECURITY alinhada ao código  

---

## 12. Conclusão

A plataforma **consegue** receber e creditar, mas o caminho automático dependia de um webhook **mal alinhado com a Velana**. Isso explica exatamente o teste real às 22:44.

O crédito de saldo em si (idempotente) é bom. Os buracos maiores agora são:

1. **Confiabilidade webhook** (edge cases + retry)  
2. **Eventos não-paid sem confirmação**  
3. **UI/admin com mock** e webhooks seller fictícios  
4. **Ausência de testes automatizados** no fluxo de dinheiro  

Prioridade: Sprint A + B antes de volume real alto de vendas.
