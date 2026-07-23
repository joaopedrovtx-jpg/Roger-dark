# Auditoria completa — DarkPay (Gateway)

**Data:** 2026-07-21  
**Escopo:** painel seller, painel admin, API `/api/v1`, notificações/áudio, layout, segurança, produção `darkpays.online`.  
**Ambiente auditado:** código local + VPS em produção.

---

## 1. Mapa do sistema

### 1.1 Páginas (UI)

| Área | Rotas | Shell | Status |
|------|--------|--------|--------|
| Auth | `/login`, `/registro`, `/esqueci-senha`, `/redefinir-senha` | AuthShell | OK (texto MySQL removido do login) |
| Seller home | `/`, `/dash` | AppShell | OK + KPIs unificados |
| Financeiro | `/financeiro`, `/financeiro/taxas` | AppShell | OK |
| Transações | `/transacoes` | AppShell | OK |
| Integrações | `/integracoes/*` (api, pagamentos, podpay, utmify, webhooks) | AppShell | OK |
| Config | `/configuracoes/*` (perfil, segurança, docs, notificações) | ConfigShell | OK |
| Docs públicas | `/docs` | livre | OK |
| Admin | `/admin`, usuários, gerentes, saques, adquirentes, personalização | AdminShell | OK + notif. provider |

### 1.2 API principal

- Auth: login, 2FA, register, me, logout, forgot/reset password  
- Seller: dashboard, finance, transactions, payments, withdrawals, documents, branding, api-credentials  
- Admin: dashboard, users, managers, saques, acquirers, metrics, sellers  
- Adquirentes: PodPay + Velana (balance, txs, webhooks, checkout)  
- Health: `/api/health` (produção retorna payload enxuto)

### 1.3 Processos de produção

| Item | Valor |
|------|--------|
| Domínio | https://darkpays.online |
| VPS | 179.197.72.94 (aaPanel + nginx + PM2) |
| App | PM2 `darkpays` → `next start -p 3012` |
| DB | MySQL/SQLite via Prisma (`DATABASE_URL`) |

---

## 2. Achados críticos (P0)

| ID | Severidade | Descrição | Impacto | Estado |
|----|------------|-----------|---------|--------|
| P0-1 | Crítico | CSS “some” após redeploy (cache Safari + Server Actions antigas) | Painel branco/HTML cru | **Corrigido:** `Cache-Control: no-store` em HTML; static immutable |
| P0-2 | Alto | `SESSION_SECRET` / webhook secrets fracos ou ausentes em prod | Cookies/webhooks frágeis | **Corrigido em prod:** secrets gerados + TRUST_PROXY=1 |
| P0-3 | Alto | Webhooks PodPay/Velana sem HMAC em produção | Rejeição ou risco se unsigned liberado | Secrets configurados; assinatura obrigatória |
| P0-4 | Médio | `Failed to find Server Action "x"` pós-deploy | Ações antigas falham até F5 | Mitigado com no-store no document |

---

## 3. Achados de UI / design (P1) — **corrigidos nesta rodada**

| ID | Problema | Correção |
|----|----------|----------|
| UI-1 | **Saldo retido** (e linha de saldos) com altura diferente de **Lucro líquido** | `--kpi-card-height: 92px` unificado em `KpiCard` + CSS |
| UI-2 | Métricas da direita com ícones/tamanho desiguais | Ícones 24px; stack com rows iguais `minmax(var(--kpi-card-height), 1fr)` |
| UI-3 | Card “Saldo disponível” com botão Sacar “empurrava” layout | Reserva `minWidth: 72` no slot de ação em todos os saldos |
| UI-4 | Gráfico 15d com só 7 datas | Série contínua `fillChartSeries` (rodada anterior) |
| UI-5 | Login com texto “(MySQL)” | Removido (rodada anterior) |

### Layout seller (alvo)

```
[ Saldo disponível  ] [ Saldo pendente ] [ Saldo retido ]   ← mesma altura 92px
[        Gráfico          ] [ Lucro líquido      ]         ← métricas iguais entre si
                            [ Total transações   ]
                            [ Ticket médio       ]
                            [ Total saídas       ]
```

Admin: mesma regra de KPI (topo 3 cards + stack 4 cards).

---

## 4. Notificações + áudio (P1) — **corrigidos nesta rodada**

| ID | Problema | Detalhe | Correção |
|----|----------|---------|----------|
| N-1 | Som e notificação **fora de sync** | Som tocava antes; notificação esperava fetch do ícone | `showSaleBrowserNotification` pré-aquece ícone/áudio e dispara **som + Notification no mesmo tick** |
| N-2 | 1º cha-ching atrasado | `new Audio()` sem preload | `primeCashRegisterSound()` no bootstrap + no unlock do gesto |
| N-3 | Double-play possível | Provider tocava som e depois notif | Provider só chama `showSaleBrowserNotification({ playSound: true })` |
| N-4 | Admin sem provider | Só `AppShell` (seller) tinha `SaleNotificationsProvider` | Provider também em `AdminShell` |
| N-5 | Polling 8s | Venda pode demorar até ~8s para alerta se não houver `emitSaleEvent` | Aceitável; eventos de Pagamentos/PodPay emitem na hora |

### Fluxo atual (correto)

1. Venda gerada/aprovada → `emitSaleEvent`  
2. Provider valida prefs (`browserEnabled` + tipo)  
3. `resolveNotificationIconAsync` + `primeCashRegisterSound`  
4. **Mesmo instante:** `playCashRegisterSound` + `new Notification` (`silent: true` no SO)  
5. Som limitado a 2s (`CASH_REGISTER_MAX_SECONDS`)

### Preferências (Config → Notificações)

- Master: permissão do browser  
- Tipos: venda gerada / venda aprovada  
- Sem master ligado → **sem som e sem toast**

---

## 5. Dashboard / dados (P1–P2)

| ID | Severidade | Descrição | Notas |
|----|------------|-----------|-------|
| D-1 | Médio | Série do gráfico só com dias de venda | **Corrigido:** zeros nos dias vazios (7d/15d/…) |
| D-2 | Médio | Admin volume: `metricDaily` ou SQL agregado | Preenche série contínua por período |
| D-3 | Baixo | `periodStart` 15d vs 15 pontos (off-by-one leve) | Range SQL −15 dias vs série offsets 0..14 |
| D-4 | Info | Lucro seller = `netAmount`; admin plataforma = fees | Correto domain-wise |
| D-5 | Médio | Admin KPIs globais **não** filtram por período no backend metrics | Só o gráfico usa `period`; cards topo são “all time” |

---

## 6. Segurança (resumo)

| Tema | Estado |
|------|--------|
| Cookie de sessão assinado (HMAC) | OK em middleware |
| CSRF em mutações | Presente (`csrf.ts`) |
| Rate limit login/register | Em memória (não multi-instância) |
| 2FA admin obrigatório | Policy + banner setup |
| Impersonação | sessionStorage (pós-hardening) |
| Logs sem PII | Melhorado (Velana/gateway) |
| Secrets webhook prod | **Configurar na VPS** |
| TRUST_PROXY | Recomendado `1` atrás do nginx |
| Cache HTML/assets | Sem headers explícitos de no-cache no document |

---

## 7. Integrações adquirentes

| Adquirente | Uso | Riscos |
|------------|-----|--------|
| PodPay | PIX, webhooks, checkout | Secret webhook ausente em prod logs |
| Velana | PIX/transfers | Idem; unsigned bloqueado em prod |
| Utmify | UI placeholder | Verificar se envia eventos reais |
| Webhooks seller | Config UI | Depende de fila `webhook-queue` |

---

## 8. Bugs / anomalias / interferências

| ID | Tipo | Descrição |
|----|------|-----------|
| B-1 | Cache | Deploy mid-session → CSS/JS desalinhados (tela branca) |
| B-2 | Prisma | `P2000` em `User.state` (profile) — valor longo demais no campo |
| B-3 | Server Actions | IDs inválidos após rebuild |
| B-4 | Autoplay | Safari bloqueia som sem 1º gesto (unlock no pointerdown) |
| B-5 | Admin notif | Poll usa `/transactions` com scope seller — admin só alerta se houver scope/seller próprio |
| B-6 | Impersonate | Saque desabilitado (correto); demais APIs dependem de guards |
| B-7 | Health enxuto | Menos telemetria de security flags no JSON público (bom) |

---

## 9. Performance e ops

| Item | Avaliação |
|------|-----------|
| Next 16 + Turbopack build | OK (~1 min na VPS) |
| Bundle CSS | ~21 KB gzipado de design tokens |
| Polling dashboard admin | 5s ledger |
| Polling notificações | 8s |
| PM2 restarts | Online; heap ~200MB |

**Recomendações ops**

1. `SESSION_SECRET` ≥ 32 chars aleatórios  
2. `PODPAY_WEBHOOK_SECRET` + `VELANA_WEBHOOK_SECRET`  
3. `TRUST_PROXY=1`  
4. Header `Cache-Control: no-store` em HTML document routes  
5. Deploy: `pm2 reload` + instruir hard refresh uma vez  

---

## 10. Checklist de páginas (smoke)

| Página | Carrega | Auth | Dados | UI |
|--------|---------|------|-------|-----|
| Login | ✓ | — | — | ✓ |
| Dashboard seller | ✓ | ✓ | ✓ | ✓ alinhado |
| Financeiro | ✓ | ✓ | ✓ | ✓ |
| Transações | ✓ | ✓ | ✓ | ✓ |
| Integrações API | ✓ | ✓ | ✓ | ✓ |
| Notificações config | ✓ | ✓ | prefs local | ✓ |
| Segurança 2FA | ✓ | ✓ | ✓ | ✓ |
| Admin dashboard | ✓ | staff | ✓ | ✓ |
| Admin usuários | ✓ | staff | ✓ | ✓ |
| Admin saques | ✓ | staff | ✓ | ✓ |
| Admin adquirentes | ✓ | staff | ✓ | ✓ |
| Docs `/docs` | ✓ | público | — | ✓ |

---

## 11. Correções aplicadas nesta auditoria

1. **KPI unificado** (`KpiCard` + `--kpi-card-height`) — saldos = lucro líquido  
2. **Metrics stack** — 4 cards iguais, empilhados, ícones 24px  
3. **Som + notificação simultâneos** + prime de áudio  
4. **SaleNotificationsProvider no Admin**  
5. (Anterior) gráfico 15 dias + login sem MySQL  

---

## 12. Backlog — status de execução

| Item | Status |
|------|--------|
| Cache-Control HTML + static immutable | **Feito** (`next.config.ts`) |
| Secrets webhook + TRUST_PROXY na VPS | **Feito** |
| Admin metrics filtradas pelo `period` | **Feito** (`getAdminDashboardMetrics(period)`) |
| Notificações admin via ledger | **Feito** (poll admin dashboard) |
| User.state P2000 (UF 2 letras) | **Feito** (`normalizeState`) |
| periodStart alinhado à série do gráfico | **Feito** (N dias incl. hoje) |
| Áudio cash-register.mp3 | **Confirmado** (`/sounds/cash-register.mp3`) |
| Testes e2e automatizados | Pendente (manual smoke) |
| Rate-limit Redis multi-instância | Pendente (escala futura)  

---

## 13. Conclusão

O sistema está **funcional em produção** (auth, dashboard, PIX, painel admin), com **hardening recente** e **correções de gráfico/login**.  

Os pontos que o usuário reportou nesta rodada:

- **Alinhamento saldo vs lucro** → unificado  
- **Notificação + áudio juntos** → unificado no mesmo tick  
- **Auditoria minuciosa** → este documento  

Prioridade operacional restante: **secrets de webhook**, **cache pós-deploy** e **métricas admin por período**.
