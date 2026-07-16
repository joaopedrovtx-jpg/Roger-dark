# DarkPay — mapa UI → banco MySQL

Arquivo SQL: **`darkpay.sql`** (raiz).  
Import: `mysql -u root -p < darkpay.sql`

## Painel Seller

| Tela / função | Cards / botões | Tabelas |
|---------------|----------------|---------|
| **Dashboard** | Saldo disponível, pendente, retido · Sacar · Lucro líquido · Total TXs · Ticket médio · Total saídas · Gráfico volume · Banner · Filtro período | `users`, `metric_daily`, `transactions`, `balance_ledger`, `brand_banners` |
| **Transações** | Pagos, pendentes, ticket, recusados, reembolsos, conversão · lista vendas | `transactions` |
| **Financeiro** | Total saídas · Saldo disponível + **Sacar** · Saldo retido · histórico saques | `users`, `withdrawals`, `balance_ledger` |
| **Taxas** | Card Pix D+0 (3% + R$ 0,15) | `platform_fee_plans`, `users.mdr*` |
| **Integrações / API** | Criar credencial, permissões, regenerar, copiar, excluir | `api_credentials` |
| **Integrações / Webhooks** | URL, eventos, ativo | `webhook_endpoints`, `webhook_deliveries` |
| **Integrações / UTMify** | Token, ativo | `integration_utmify` |
| **Integrações / PodPay** | Saldo, pagamentos, saques, checkout, webhooks | `acquirers`, `payment_charges`, `transactions`, `withdrawals` |
| **Integrações / Pagamentos** | Criar cobrança PIX, simular | `payment_charges` |
| **Perfil** | Nome, e-mail, telefone, docs | `users` |
| **Meus documentos** | Upload / status KYC | `documents` |
| **Notificações** | Preferências + toasts de venda | `notification_settings`, `sale_notifications` |
| **Segurança** | Ativar / desativar 2FA | `user_2fa` |
| **Login / Registro / Senha** | Auth | `users`, `sessions`, `password_resets` |

## Painel Admin

| Tela / função | Cards / botões | Tabelas |
|---------------|----------------|---------|
| **Dashboard** | Volume processado · Receita plataforma · Total TXs · Ticket médio · Total usuários · Saldo retido total · Taxa conversão · gráfico · ledger | `metric_daily`, `users`, `transactions` |
| **Usuários** | Total, ativos, pendentes, bloqueados, hoje, novos · Ver modal | `users` |
| **Usuário → Dados** | PF/PJ, endereço, status | `users` |
| **Usuário → Documentos** | Ativar / Revisar / Bloquear | `documents` |
| **Usuário → Taxas** | MDR %/fixo · saque %/fixo · **Salvar** | `users.mdr*`, `users.saque*` |
| **Usuário → Adquirentes** | Toggle adquirentes + personalizados · saque automático | `user_acquirers`, `seller_custom_acquirers`, `users.saqueAutomatico` |
| **Gerentes** | Ativos/inativos · criar · permissões · ativar/desativar | `managers`, `users.managerId` |
| **Saques** | Total pago · esperando liberação · lucro sobre saque · aprovados/pendentes/recusados · aprovar/recusar | `withdrawals` |
| **Adquirentes / Gerenciamento** | Volume, TXs, status, taxas pagas, ticket, reembolsos · ativar/manutenção/desativar · prioridade | `acquirers` |
| **Adquirentes / Credenciais** | Chave pública · chave privada · salvar / limpar | `acquirers.publicKey`, `acquirers.privateKey` |
| **Personalização** | Logo, ícone, auth image, banners (nome/link/ordem) | `branding`, `brand_banners` |

## Métricas (como calcular)

| Card | Origem |
|------|--------|
| Saldo disponível / pendente / retido | `users.balanceAvailable/Pending/Held` (+ `balance_ledger`) |
| Lucro líquido seller | `metric_daily.sellerProfit` ou Σ fees/net de `transactions` |
| Total de transações | `COUNT(transactions)` / `metric_daily.txCount` |
| Ticket médio | `AVG(amount)` onde status = aprovada |
| Total de saídas | Σ `withdrawals.amount` pagos / `metric_daily.outflowTotal` |
| Taxa de conversão | pagos / (pagos+recusados+pendentes) × 100 |
| Volume processado (admin) | Σ `transactions.amount` aprovadas |
| Receita da plataforma | Σ `transactions.platformFee` + Σ `withdrawals.feeAmount` |
| Saldo retido total | Σ `users.balanceHeld` |
| Lucro sobre saque | Σ `withdrawals.feeAmount` onde status = pago |
| Usuários hoje / novos | `users.createdAt` filtrado |

## Connection string

```env
DATABASE_URL=mysql://user:senha@localhost:3306/darkpay
```

## APIs admin (backend → MySQL ou mock)

| Endpoint | Página / uso |
|----------|----------------|
| `GET /api/v1/admin/dashboard` | Dashboard: metrics + gráfico + histórico |
| `GET /api/v1/admin/metrics` | Só cards da dashboard |
| `GET /api/v1/admin/users` | Usuários: lista + contagens |
| `GET /api/v1/admin/managers` | Gerentes |
| `GET /api/v1/admin/saques` | Saques: lista + cards |
| `GET /api/v1/admin/acquirers` | Adquirentes: lista + cards |
| `PATCH /api/v1/admin/withdrawals/:id` | Aprovar / recusar saque |
| `PATCH /api/v1/admin/users/:id` | Status, taxas, docs, rota, saque auto |
| `PATCH /api/v1/admin/acquirers/:id` | Status, prioridade, credenciais |
| `PATCH /api/v1/admin/managers/:id` | Ativar / desativar gerente |
| `GET/PUT /api/v1/branding` | Personalização (logo, banners) |

Serviço: `src/lib/server/db/admin.service.ts`  
Com `DATABASE_URL` válida → grava/lê **MySQL**. Sem DB → **mock** (app não quebra).

```bash
mysql -u root -p < darkpay.sql
npm install && npx prisma generate
# .env → DATABASE_URL=mysql://user:senha@localhost:3306/darkpay
npm run dev
```
