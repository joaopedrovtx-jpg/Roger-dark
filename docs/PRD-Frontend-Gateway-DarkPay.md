# PRD COMPLETO — Análise e Especificação do Frontend

## Gateway DarkPay (referência visual: Dashboard Gateway.FY)

| Campo | Valor |
|--------|--------|
| **Documento** | Product Requirements Document — Frontend |
| **Versão** | 2.1.0 |
| **Data** | 2026-07-10 |
| **Status** | Baseline de implementação — **parity visual obrigatória** |
| **Idioma da UI** | Português (Brasil) |
| **Tema** | Dark only |
| **Objetivo** | Documentar **100% da estrutura visual e de UI** da referência para recriar o front **exatamente igual à imagem** |
| **Imagem de referência** | `docs/referencia-dashboard.jpg` (**1600 × 873 px**) |
| **Spec pixel-perfect** | `docs/SPEC-PIXEL-PERFECT.md` ← **fonte da verdade para “ficar igual”** |

---

## ⚠️ Regra de ouro (ler antes de codar)

> **A imagem de referência é a lei.**  
> Se o PRD, o gosto do dev ou um “melhor design” divergirem da imagem → **a imagem vence**.  
> Medidas, textos, ordem do chart, cores e hierarquia estão travados em `SPEC-PIXEL-PERFECT.md`.  
> QA obrigatório: overlay a **1600px** de largura em cima de `referencia-dashboard.jpg` até parity **≥ 95%**.

### Pacote de documentos do front

| Arquivo | Função |
|---------|--------|
| `docs/referencia-dashboard.jpg` | Ground truth visual (1600×873) |
| `docs/SPEC-PIXEL-PERFECT.md` | Medidas, textos literais, mock, checklist “igual à imagem” |
| `docs/PRD-Frontend-Gateway-DarkPay.md` | Este PRD (produto, componentes, PRs, a11y) |
| `docs/design-tokens.css` | Tokens CSS para colar no bootstrap |

---

# SUMÁRIO

1. [Visão geral do produto e da tela](#1-visão-geral-do-produto-e-da-tela)
2. [Arquitetura de layout (grid geral)](#2-arquitetura-de-layout-grid-geral)
3. [Sistema de cores (design tokens)](#3-sistema-de-cores-design-tokens)
4. [Tipografia e textos](#4-tipografia-e-textos)
5. [Espaçamento, raios e elevação](#5-espaçamento-raios-e-elevação)
6. [Sistema de ícones](#6-sistema-de-ícones)
7. [Inventário de componentes](#7-inventário-de-componentes)
8. [Análise região por região](#8-análise-região-por-região)
9. [Gráficos e visualizações](#9-gráficos-e-visualizações)
10. [Estados de interface](#10-estados-de-interface)
11. [Navegação e sitemap](#11-navegação-e-sitemap)
12. [Formatação de dados (pt-BR)](#12-formatação-de-dados-pt-br)
13. [Dados mock da referência](#13-dados-mock-da-referência)
14. [Responsividade](#14-responsividade)
15. [Acessibilidade](#15-acessibilidade)
16. [Stack e estrutura de pastas](#16-stack-e-estrutura-de-pastas)
17. [Requisitos funcionais e não funcionais](#17-requisitos-funcionais-e-não-funcionais)
18. [Key Decisions](#18-key-decisions)
19. [Open Questions](#19-open-questions)
20. [PR Plan](#20-pr-plan)
21. [Checklist de parity visual](#21-checklist-de-parity-visual)
22. [Apêndices](#22-apêndices)

---

# 1. Visão geral do produto e da tela

## 1.1 O que é

Painel **merchant** de gateway de pagamento (SaaS fintech BR). A tela analisada é o **Dashboard** autenticado: visão consolidada de saldos, lucro, transações, conversão por método de pagamento, histórico de faturamento, ranking de produtos e estatísticas de vendas.

## 1.2 Estética dominante

| Atributo | Descrição |
|----------|-----------|
| Tema | Dark mode exclusivo |
| Densidade | Média-alta (muitos dados, sem poluição) |
| Superfícies | Cards flat com borda sutil (quase sem sombra) |
| Cor de ação / dados positivos | Verde mint/neon (`#12D66C` alvo) |
| Idioma visual | Fintech premium, cantos arredondados, ícones outline |
| Hierarquia | Títulos claros → labels cinza → valores grandes brancos ou verdes |

## 1.3 Escopo deste PRD

| Dentro | Fora (fase 1) |
|--------|----------------|
| Layout completo do Dashboard | API real de pagamentos |
| Design system (cores, tipo, espaço, ícones) | KYC / antifraude |
| Todos os componentes visíveis na referência | App mobile nativo |
| Shell (sidebar + topbar) e rotas placeholder | Light theme |
| Mock de dados fiéis ao screenshot | Multi-idioma |
| Modal “Solicitar saque” (UI) | Processamento real de saque |

## 1.4 Princípio de recriação

> **Pixel-faithful no desktop (≥1280px):** mesma estrutura, mesma hierarquia, mesmos padrões de cor, tipo, ícone e espaçamento. Branding do repositório = **Gateway DarkPay** (não copiar marca alheia; copiar o *sistema de UI*).

---

# 2. Arquitetura de layout (grid geral)

## 2.1 Esqueleto da aplicação (3 zonas + header)

```
┌──────────────────────────────── TOPBAR (full width, ~60px) ────────────────────────────────┐
│  [Logo]                                              [Volume meter]  [User menu]           │
├──────────────┬────────────────────────────────────────────────────┬────────────────────────┤
│              │                                                    │                        │
│   SIDEBAR    │              MAIN CONTENT                          │     ASIDE DIREITA      │
│   ~252px     │              (flex 1, fluido)                      │     ~300px             │
│   fixa       │                                                    │     sticky/scroll      │
│              │  • Page header (saudação + ações)                  │  • Top products card   │
│   Nav items  │  • Grid KPI 3×2                                    │  • Sales stats card    │
│              │  • Grid Conversão 1×3                              │                        │
│              │  • Card gráfico faturamento                        │                        │
│              │                                                    │                        │
└──────────────┴────────────────────────────────────────────────────┴────────────────────────┘
```

## 2.2 Dimensões de layout (desktop referência ~1440–1600px)

| Região | Largura / altura | Comportamento |
|--------|------------------|---------------|
| Topbar | 100% × **56–64px** | Sticky top; z-index alto |
| Sidebar | **240–260px** (alvo **252px**) × 100vh | Sticky left; scroll se overflow |
| Main | `1fr` (resto) | Padding **24–32px** |
| Aside direita | **280–320px** (alvo **300px**) | Coluna de cards empilhados; gap **16–20px** |
| Gap main ↔ aside | **16–24px** | |
| Gap entre seções no main | **16–20px** | |

## 2.3 Grid do conteúdo principal (main)

```
[ PageHeader: título | subtítulo  ............  botões ]
[ KpiCard ] [ KpiCard ] [ KpiCard ]     ← row 1 (3 col iguais)
[ KpiCard ] [ KpiCard ] [ KpiCard ]     ← row 2 (3 col iguais)
[ Conversion ] [ Conversion ] [ Conversion ]  ← row 3
[ ########### RevenueChartCard (full width da main) ## ]
```

- KPIs: `display: grid; grid-template-columns: repeat(3, 1fr); gap: 12–16px`
- Conversões: mesmo grid de 3 colunas
- Chart: `grid-column: 1 / -1` ou bloco full width abaixo

## 2.4 Grid da aside direita

```
[ Card: Produtos mais vendidos ]
[ Card: Estatísticas de vendas ]
```

- `display: flex; flex-direction: column; gap: 16–20px`
- Largura fixa/min da coluna

## 2.5 Camadas (z-index sugerido)

| Camada | z-index |
|--------|---------|
| Conteúdo | 0 |
| Sidebar / Topbar sticky | 20 |
| Dropdowns | 40 |
| Modal / drawer | 50 |
| Toast | 60 |

---

# 3. Sistema de cores (design tokens)

## 3.1 Superfícies (backgrounds)

| Token | Hex alvo | Uso |
|-------|----------|-----|
| `--bg-app` | `#0B0D10` | Fundo global da página |
| `--bg-sidebar` | `#0A0C0F` | Fundo da sidebar (igual ou 1 tom mais escuro) |
| `--bg-topbar` | `#0B0D10` | Mesmo do app ou card sutil |
| `--bg-card` | `#14171C` | Cards KPI, chart, listas |
| `--bg-card-hover` | `#1A1F27` | Hover em cards clicáveis |
| `--bg-elevated` | `#1C2129` | Badge de ícone KPI, dropdown, modal |
| `--bg-input` | `#12151A` | Campos de formulário |
| `--bg-progress-track` | `#1E2430` | Trilha de barras e anéis |

## 3.2 Bordas

| Token | Hex alvo | Uso |
|-------|----------|-----|
| `--border-subtle` | `#22272F` | Contorno dos cards (1px) |
| `--border-muted` | `#2E3540` | Divisores, inputs default |
| `--border-focus` | `#12D66C` | Focus ring |
| `--border-green` | `#12D66C` | Botão outline “Solicitar saque” |

## 3.3 Marca / accent (verde)

| Token | Hex / valor | Uso |
|-------|-------------|-----|
| `--green-primary` | `#12D66C` | CTA fill, nav ativo, chart, valores ranking, barras |
| `--green-primary-hover` | `#1AE078` | Hover CTA |
| `--green-soft` | `rgba(18,214,108,0.14)` | Fundos suaves opcionais |
| `--green-glow` | `rgba(18,214,108,0.25)` | Sombra glow opcional em CTA |
| `--green-ring` | `#12D66C` | Stroke dos progress rings |
| `--text-on-green` | `#04140A` | Texto/ícone **em cima** do verde sólido |

> **Importante:** o item de nav **Dashboard** ativo NÃO é texto verde em fundo dark — é **pill verde sólido** com texto/ícone **escuros**.

## 3.4 Texto

| Token | Hex alvo | Uso |
|-------|----------|-----|
| `--text-primary` | `#F2F4F7` | Títulos, valores KPI, nomes |
| `--text-secondary` | `#9AA3B2` | Labels de KPI, subtítulos |
| `--text-muted` | `#6B7280` | Eixos do chart, hints, rank `#n` |
| `--text-link` | `#12D66C` | Links / valores de destaque (ranking, %) |
| `--text-on-green` | `#04140A` | Sobre botão/nav verde |

## 3.5 Ícones

| Token | Hex | Uso |
|-------|-----|-----|
| `--icon-default` | `#8B95A5` | Sidebar inativa, ícones neutros |
| `--icon-primary` | `#F2F4F7` | Ícones em destaque |
| `--icon-accent` | `#12D66C` | Ícones nos badges de KPI / conversão |
| `--icon-on-green` | `#04140A` | Dentro do pill verde ativo |
| `--icon-warning` | `#F5A623` | Estrela do volume meter |

## 3.6 Semânticas (reservadas)

| Token | Hex | Uso futuro |
|-------|-----|------------|
| `--success` | `#12D66C` | Status ok |
| `--warning` | `#F5A623` | Alertas |
| `--danger` | `#EF4444` | Erros / falhas |
| `--info` | `#3B82F6` | Informativo |

## 3.7 Chart

| Token | Valor |
|-------|--------|
| `--chart-line` | `#12D66C` |
| `--chart-dot-fill` | `#12D66C` |
| `--chart-dot-stroke` | `#0B0D10` (ou branco sutil) |
| `--chart-fill-start` | `rgba(18,214,108,0.28)` |
| `--chart-fill-end` | `rgba(18,214,108,0)` |
| `--chart-grid` | `#1E2430` |
| `--chart-axis` | `#6B7280` |

## 3.8 Regras de uso de cor

1. **Fundo** nunca usa verde sólido em grandes áreas (exceto nav item ativo e botões).
2. **Valores monetários padrão** = branco (`--text-primary`).
3. **Valores de ranking de produto** = verde (`--green-primary`).
4. **Labels** sempre secondary/muted, nunca branco puro.
5. **Progress bars / rings** = fill verde + track cinza escuro.
6. Contraste texto primário sobre card ≥ **4.5:1**.

---

# 4. Tipografia e textos

## 4.1 Família tipográfica

```
font-family: "Inter", "Geist", "Plus Jakarta Sans", system-ui, -apple-system, sans-serif;
```

- Carregar via `next/font` (Inter).
- Números de KPI/ranking: `font-variant-numeric: tabular-nums`.

## 4.2 Escala tipográfica

| Token | Size | Line-height | Weight | Uso |
|-------|------|-------------|--------|-----|
| `--text-2xs` | 9–10px | 1.2 | 500 | Tagline logo “PAYMENT SOLUTIONS” (uppercase) |
| `--text-xs` | 11px | 1.3 | 400 | Eixos do gráfico |
| `--text-sm` | 12px | 1.4 | 400–500 | Labels KPI, descrição de seções, rank `#n` |
| `--text-md` | 13px | 1.4 | 400–500 | Subtítulo welcome, itens ranking, stats |
| `--text-base` | 14px | 1.4 | 500–600 | Nav items, botões, body |
| `--text-lg` | 16px | 1.3 | 600 | Título de card (“Histórico…”, “Produtos…”) |
| `--text-xl` | 18–20px | 1.2 | 600–700 | Valores KPI |
| `--text-2xl` | 24–28px | 1.2 | 600–700 | Saudação “Olá, Nome” |
| `--text-logo` | 16–18px | 1.1 | 700 | Wordmark |

## 4.3 Pesos (weights)

| Weight | Token | Uso |
|--------|-------|-----|
| 400 | regular | Subtítulos, descrições |
| 500 | medium | Nav, labels, nomes de produto |
| 600 | semibold | Títulos de seção, botões, valores |
| 700 | bold | Logo, H1 opcional |

## 4.4 Letter-spacing

| Contexto | Tracking |
|----------|----------|
| Tagline logo uppercase | `0.08em` – `0.12em` |
| Body / UI | `0` / normal |
| Valores grandes | normal (tabular) |

## 4.5 Hierarquia textual por papel (style guide)

| Papel | Size | Weight | Color | Exemplo na tela |
|-------|------|--------|-------|-----------------|
| Logo wordmark | 16–18px | 700 | primary | Gateway.FY / DarkPay |
| Logo tagline | 9–10px | 500 | muted | PAYMENT SOLUTIONS |
| Page title (H1) | 24–28px | 600–700 | primary | Olá, Igor Rocha |
| Page subtitle | 13–14px | 400 | secondary | Seja bem-vindo ao painel… |
| Section title | 16–18px | 600 | primary | Histórico de faturamento |
| Section description | 12–13px | 400 | muted | Acompanhe o histórico… |
| KPI label | 12–13px | 400–500 | secondary | Saldo disponível |
| KPI value | 18–22px | 600–700 | primary | R$ 788.901,86 |
| Nav item inactive | 14px | 500 | secondary/primary soft | Vitrine |
| Nav item active | 14px | 600 | on-green | Dashboard |
| Button label | 13–14px | 600 | on-green ou green | Ver todos / Solicitar saque |
| Rank index | 12–13px | 500 | muted | #1 |
| Product name | 13–14px | 500 | primary | Produto 1 |
| Product revenue | 13–14px | 600 | **green** | R$ 488.424,04 |
| Stat label | 13px | 500 | primary | PIX |
| Stat value | 13px | 600 | primary | R$ 35.064,43 |
| Ring percent | 11–12px | 600 | green ou primary | 90% |
| Chart axis | 11–12px | 400 | muted | 23/12/2025 |
| Volume meter | 12–13px | 500–600 | primary | 880.9K / 950K |
| User name topbar | 13–14px | 500 | primary | Igor Rocha |

## 4.6 Catálogo completo de microcopy (strings da UI)

### Topbar / Brand
| ID | Texto |
|----|--------|
| `brand.name` | Gateway DarkPay *(ou marca final)* |
| `brand.tagline` | PAYMENT SOLUTIONS |
| `volume.fraction` | `{current} / {goal}` → ex. `880.9K / 950K` |

### Page header
| ID | Texto |
|----|--------|
| `dash.hello` | Olá, {fullName} |
| `dash.welcome` | Seja bem-vindo ao painel de controle da sua empresa |
| `action.withdraw` | Solicitar saque |
| `filter.last_week` | Última semana |
| `filter.last_15` | Últimos 15 dias |
| `filter.last_30` | Último mês |
| `filter.custom` | Personalizado |

### KPI labels
| ID | Texto |
|----|--------|
| `kpi.balance_available` | Saldo disponível |
| `kpi.balance_pending` | Saldo pendente |
| `kpi.balance_held` | Saldo retido |
| `kpi.net_profit` | Lucro líquido |
| `kpi.total_transactions` | Total de Transações |
| `kpi.avg_ticket` | Ticket médio |

### Conversão
| ID | Texto |
|----|--------|
| `conv.pix` | Conversão por PIX |
| `conv.boleto` | Conversão por boleto |
| `conv.card` | Conversão por cartão |
| `conv.percent` | {n}% |

### Chart
| ID | Texto |
|----|--------|
| `chart.revenue_title` | Histórico de faturamento |
| `chart.revenue_sub` | Acompanhe o histórico de transações do seu negócio |
| `chart.axis_y` | Faturamento |
| `chart.axis_x` | Período |

### Aside — produtos
| ID | Texto |
|----|--------|
| `products.top_title` | Produtos mais vendidos |
| `products.see_all` | Ver todos |
| `products.rank` | #{n} |

### Aside — estatísticas
| ID | Texto |
|----|--------|
| `stats.title` | Estatísticas de vendas |
| `stats.pix` | PIX |
| `stats.card` | Cartão de crédito |
| `stats.boleto` | Boleto |

### Sidebar
| ID | Texto |
|----|--------|
| `nav.dashboard` | Dashboard |
| `nav.vitrine` | Vitrine |
| `nav.vendas` | Vendas |
| `nav.financeiro` | Financeiro |
| `nav.clientes` | Clientes |
| `nav.produtos` | Produtos |
| `nav.config` | Configurações |
| `nav.integracoes` | Integrações |
| `nav.dominios` | Domínios |

### User menu (inferido)
| ID | Texto |
|----|--------|
| `user.profile` | Meu perfil |
| `user.settings` | Configurações |
| `user.logout` | Sair |

### Modal saque (UI fase 1)
| ID | Texto |
|----|--------|
| `withdraw.title` | Solicitar saque |
| `withdraw.amount` | Valor |
| `withdraw.pix_key` | Chave PIX |
| `withdraw.available` | Disponível: {money} |
| `withdraw.confirm` | Confirmar saque |
| `withdraw.cancel` | Cancelar |

### Estados
| ID | Texto |
|----|--------|
| `empty.generic` | Nada para exibir no momento |
| `error.generic` | Não foi possível carregar. Tente novamente. |
| `loading.generic` | Carregando… |

---

# 5. Espaçamento, raios e elevação

## 5.1 Escala de spacing

| Token | px | Uso típico |
|-------|-----|------------|
| `--space-0` | 0 | |
| `--space-1` | 4 | gaps micro, ícone-texto apertado |
| `--space-2` | 8 | gap ícone + label em nav |
| `--space-3` | 12 | gap entre cards KPI; padding compacto |
| `--space-4` | 16 | padding card interno (mínimo) |
| `--space-5` | 20 | padding card confortável |
| `--space-6` | 24 | padding main / seções |
| `--space-8` | 32 | padding main amplo |
| `--space-10` | 40 | separações grandes |
| `--space-12` | 48 | | 

## 5.2 Espaçamentos específicos da tela

| Elemento | Valor |
|----------|--------|
| Padding interno card KPI | **16–20px** |
| Gap grid KPI / conversão | **12–16px** |
| Gap entre blocos verticais no main | **16–20px** |
| Padding horizontal main | **24–32px** |
| Padding vertical main (topo) | **20–28px** |
| Padding items sidebar | **10–12px vertical × 12–16px horizontal** |
| Gap ícone ↔ texto nav | **10–12px** |
| Gap badge ícone ↔ textos KPI | **12px** |
| Gap entre items ranking | **12–16px** |
| Gap entre stats | **14–16px** |
| Padding card aside | **16–20px** |
| Altura botão padrão | **36–40px** |
| Altura item nav | **40–44px** |
| Tamanho avatar topbar | **32–36px** |
| Tamanho thumb produto | **32–36px** |
| Tamanho badge ícone KPI | **32–36px** (círculo) |
| Tamanho progress ring conversão | **48–56px** |
| Stroke do ring | **4–5px** |
| Altura progress bar stats | **4–6px** |
| Altura volume bar topbar | **4px** |
| Largura volume bar topbar | **80–120px** |

## 5.3 Border radius

| Token | px | Uso |
|-------|-----|-----|
| `--radius-sm` | 8 | inputs, badges pequenos |
| `--radius-md` | 12 | botões, nav pill, thumbs |
| `--radius-lg` | 16 | cards principais |
| `--radius-xl` | 20 | modais / cards grandes |
| `--radius-full` | 9999 | avatar, badge circular, pill extrema |
| `--radius-ring` | 9999 | progress ring |

## 5.4 Elevação / sombra

A referência é **quase flat**:

| Elemento | Sombra |
|----------|--------|
| Cards | Nenhuma ou `0 1px 0 rgba(0,0,0,0.2)` + **borda 1px** |
| Dropdown | `0 8px 24px rgba(0,0,0,0.45)` |
| Modal | `0 16px 48px rgba(0,0,0,0.55)` |
| Botão primary (opcional) | `0 0 20px var(--green-glow)` |
| Chart | sem sombra |

**Regra:** preferir **borda sutil + bg elevado** em vez de sombra em cards.

---

# 6. Sistema de ícones

## 6.1 Estilo global

| Propriedade | Valor |
|-------------|--------|
| Estilo | Outline (stroke), cantos arredondados |
| Stroke width | **1.5 – 2px** |
| Tamanho nav | **18–20px** |
| Tamanho KPI badge | **16–18px** |
| Tamanho topbar | **14–16px** |
| Tamanho stats / conv | **16–18px** |
| Biblioteca recomendada | **Lucide React** (+ SVG custom para logo e PIX brand) |
| Cor inativa | `--icon-default` |
| Cor accent | `--icon-accent` (verde) |
| Cor em verde sólido | `--icon-on-green` |

## 6.2 Logo

| Elemento | Descrição |
|----------|-----------|
| Símbolo | 4 nós conectados (network / gateway) em verde |
| Wordmark | Nome do produto, bold |
| Tagline | `PAYMENT SOLUTIONS` uppercase micro |

## 6.3 Sidebar — mapa ícone × item

| Ordem | Item | Visual na ref. | Lucide / asset | Chevron |
|------:|------|----------------|----------------|---------|
| 1 | Dashboard | Casa | `Home` | Não |
| 2 | Vitrine | Loja / vitrine | `Store` | Não |
| 3 | Vendas | Sacola | `ShoppingBag` | Sim `ChevronRight` |
| 4 | Financeiro | Documento/lista | `FileText` | Sim |
| 5 | Clientes | Pessoas | `Users` | Não |
| 6 | Produtos | Caixa/cubo | `Package` | Sim |
| 7 | Configurações | Engrenagem | `Settings` | Sim |
| 8 | Integrações | Plug / blocos | `Plug` | Não |
| 9 | Domínios | Globo | `Globe` | Não |

**Estado ativo (Dashboard):**
- Container pill com `background: --green-primary`
- Ícone + texto em `--text-on-green`
- Sem chevron

**Estado inativo:**
- Ícone `--icon-default` + texto secondary
- Hover: fundo `--bg-card-hover`

## 6.4 Topbar

| Elemento | Ícone | Notas |
|----------|-------|-------|
| Volume | `Star` **fill** âmbar `#F5A623` | À esquerda do texto 880.9K/950K |
| User dropdown | `ChevronDown` | À direita do nome |
| Avatar | imagem ou iniciais | Círculo 32–36px |

## 6.5 Page actions

| Elemento | Ícone | Notas |
|----------|-------|-------|
| Solicitar saque | nenhum ou `Banknote` | Outline verde |
| Período | `Filter` (funil) | Botão dark com borda sutil |

## 6.6 KPI cards — ícones em badge circular

| KPI | Ícone visual | Lucide | Cor do ícone |
|-----|--------------|--------|--------------|
| Saldo disponível | Cifrão `$` | `DollarSign` | verde |
| Saldo pendente | Relógio | `Clock` | verde |
| Saldo retido | Relógio | `Clock` | verde |
| Lucro líquido | Cifrão `$` | `DollarSign` | verde |
| Total de Transações | Setas horizontais | `ArrowLeftRight` | verde |
| Ticket médio | Percentual | `Percent` | verde |

**Badge:** círculo 32–36px, `background: --bg-elevated`, ícone centralizado.

## 6.7 Conversão

| Método | Ícone visual | Implementação |
|--------|--------------|---------------|
| PIX | Losango / diamante (marca PIX estilizada) | SVG brand **ou** `Diamond` |
| Boleto | Barras tipo código de barras | `Barcode` / `AlignJustify` custom |
| Cartão | Cartão de crédito | `CreditCard` |

Cada card também tem **ProgressRing** (não é ícone Lucide; é componente SVG).

## 6.8 Ranking de produtos

| Caso | Visual |
|------|--------|
| Sem imagem | Cubo `Box` / `Package` em fundo cinza arredondado |
| Com imagem | Thumbnail 32×36 border-radius md, object-cover |

## 6.9 Estatísticas de vendas

| Método | Ícone |
|--------|-------|
| PIX | Diamante verde (mesmo da conversão) |
| Cartão de crédito | `CreditCard` |
| Boleto | Barras `Barcode` |

## 6.10 Ícones proibidos / a evitar

- Ícones filled pesados na sidebar (exceto estrela do volume)
- Emojis nativos no lugar de ícones de sistema
- Stroke > 2.5px (fica “grosso” demais vs referência)

---

# 7. Inventário de componentes

## 7.1 Árvore de componentes (Dashboard)

```
AppShell
├── Topbar
│   ├── BrandLogo
│   ├── VolumeMeter
│   └── UserMenu (Avatar + name + Dropdown)
├── Sidebar
│   └── NavItem[] (icon, label, active, hasChildren)
└── DashboardPage
    ├── PageHeader
    │   ├── title + subtitle
    │   ├── Button outline (Solicitar saque)
    │   └── PeriodFilter
    ├── KpiGrid
    │   └── KpiCard × 6
    ├── ConversionGrid
    │   └── ConversionCard × 3
    │       └── ProgressRing
    ├── RevenueChartCard
    │   └── RevenueLineChart
    └── RightAside
        ├── TopProductsCard
        │   ├── ProductRankItem × 5
        │   └── Button primary (Ver todos)
        └── SalesStatsCard
            └── SalesStatItem × 3
                └── ProgressBar
```

## 7.2 Especificação de cada componente

### `BrandLogo`
- Símbolo SVG + wordmark + tagline
- Clique → `/` (dashboard)

### `VolumeMeter`
- Props: `current: number`, `goal: number`
- UI: estrela âmbar + texto compactado K + barra progress fina
- Formato: `880.9K / 950K` (1 casa decimal em K quando ≥ 1000)

### `UserMenu`
- Avatar + nome + chevron
- Dropdown: Perfil, Configurações, Sair

### `NavItem`
- Props: `icon`, `label`, `href`, `active`, `hasChildren`, `onClick`
- Active = pill verde full width do item

### `PageHeader`
- Esquerda: H1 + subtitle
- Direita: slot de actions (botões)

### `Button`
| Variant | Visual |
|---------|--------|
| `primary` | bg verde, texto escuro, radius md |
| `outline` | border verde, texto verde, bg transparent |
| `ghost` / `filter` | bg card, border subtle, texto secondary |
| `fullWidth` | width 100% (Ver todos) |

### `KpiCard`
- Layout: `[BadgeIcon] [Label / Value empilhados]`
- Props: `icon`, `label`, `value` (ReactNode ou number + format)

### `ConversionCard`
- Layout: `[Icon] [Label] ........ [ProgressRing value]`
- Props: `icon`, `label`, `percent: 0–100`

### `ProgressRing`
- SVG circle `stroke-dasharray` / `dashoffset`
- Centro: texto `{percent}%`
- Track + indicator verde
- Props: `value`, `size=52`, `stroke=5`

### `ProgressBar`
- Track full width, fill % proporcional
- Altura 4–6px, radius full

### `RevenueChartCard`
- Header (title + sub) + chart area (~260–320px altura)

### `RevenueLineChart`
- Line + Area gradient + Dots + Grid + Axes + Tooltip
- Ver seção 9

### `TopProductsCard`
- Lista 5 items + botão Ver todos

### `ProductRankItem`
- `#rank` | thumb | name (truncate) | revenue (verde)

### `SalesStatsCard` / `SalesStatItem`
- icon | label | value  
- progress bar abaixo (normalizada pelo max do grupo)

### `PeriodFilter`
- Botão com Filter icon + label do range
- Menu: 7d / 15d / 30d / custom

### `WithdrawModal` (fase 1 UI)
- Dialog dark elevated; form valor + chave PIX

### `Skeleton` / `EmptyState` / `ErrorState`
- Padrões de loading e falha

### `CurrencyText` / `DateText`
- Helpers de formatação pt-BR

---

# 8. Análise região por região

## 8.1 TOPBAR

```
[Logo ícone + Gateway.XXX + PAYMENT SOLUTIONS]     [★ 880.9K/950K ████░]  [Avatar Igor Rocha ▾]
```

| Elemento | Detalhe |
|----------|---------|
| Posição logo | Esquerda absoluta do header |
| Volume | Direita, antes do user |
| User | Extrema direita |
| Separação | Sem divisor grosso; hairline opcional abaixo |
| Fundo | Igual `--bg-app` |

**Volume meter detalhe:**
- Estrela fill laranja/âmbar
- Texto `current / goal` compactado
- Barra: ~92.7% preenchida no exemplo (880.9/950)

## 8.2 SIDEBAR

| Item | Ativo | Chevron |
|------|-------|---------|
| Dashboard | **SIM** (pill verde) | Não |
| Vitrine | Não | Não |
| Vendas | Não | Sim |
| Financeiro | Não | Sim |
| Clientes | Não | Não |
| Produtos | Não | Sim |
| Configurações | Não | Sim |
| Integrações | Não | Não |
| Domínios | Não | Não |

- Itens com chevron indicam **submenu** (expandir ou navegar para grupo).
- Ordem fixa conforme tabela acima.
- Logo **não** se repete na sidebar (já está no topbar).

## 8.3 PAGE HEADER (main topo)

| Lado | Conteúdo |
|------|----------|
| Esq. | **Olá, Igor Rocha** + subtítulo welcome |
| Dir. | Botão outline **Solicitar saque** + botão filter **Última semana** |

Espaçamento entre os dois botões: **8–12px**.

## 8.4 GRID KPI (6 cards)

### Linha 1
| Card | Ícone | Label | Valor ref. |
|------|-------|-------|------------|
| 1 | $ | Saldo disponível | R$ 788.901,86 |
| 2 | clock | Saldo pendente | R$ 197.225,46 |
| 3 | clock | Saldo retido | R$ 49.306,37 |

### Linha 2
| Card | Ícone | Label | Valor ref. |
|------|-------|-------|------------|
| 4 | $ | Lucro líquido | R$ 116.357,47 |
| 5 | arrows | Total de Transações | 162 |
| 6 | % | Ticket médio | R$ 397,54 |

**Anatomia do KpiCard:**
```
┌─────────────────────────────────────┐
│  (● icon)   Label secondary         │
│             Valor primary grande    │
└─────────────────────────────────────┘
```

## 8.5 GRID CONVERSÃO (3 cards)

| Card | Ícone | Label | Ring |
|------|-------|-------|------|
| 1 | PIX diamond | Conversão por PIX | 90% |
| 2 | barcode | Conversão por boleto | 90% |
| 3 | credit card | Conversão por cartão | 90% |

**Anatomia:**
```
┌──────────────────────────────────────────┐
│  [icon]  Conversão por …        ( 90% )  │
│                                  ring    │
└──────────────────────────────────────────┘
```

## 8.6 HISTÓRICO DE FATURAMENTO

| Parte | Conteúdo |
|-------|----------|
| Título | Histórico de faturamento |
| Sub | Acompanhe o histórico de transações do seu negócio |
| Chart | Ver seção 9 |
| Altura área plot | ~240–300px |

## 8.7 PRODUTOS MAIS VENDIDOS

| Rank | Thumb | Nome | Receita |
|-----:|-------|------|---------|
| #1 | placeholder box | Produto 1 | R$ 488.424,04 |
| #2 | placeholder box | Teste | R$ 480.890,80 |
| #3 | imagem | Gateway Academy | R$ 419.622,44 |
| #4 | imagem | Curso virtual | R$ 226.574,36 |
| #5 | imagem | Marketing Digital Descomplicado… | R$ 135.648,41 |

- Nome com **ellipsis** se overflow
- Valor **sempre verde**
- Botão inferior full width: **Ver todos** (primary)

## 8.8 ESTATÍSTICAS DE VENDAS

| Método | Ícone | Valor ref. | Barra (relativa) |
|--------|-------|------------|------------------|
| PIX | diamond | R$ 35.064,43 | média (~53% do max) |
| Cartão de crédito | card | R$ 66.405,84 | **100%** (maior) |
| Boleto | barcode | R$ 5.743,07 | baixa (~9% do max) |

Normalização: `width% = value / max(values) * 100`.

---

# 9. Gráficos e visualizações

## 9.1 Tipo

- **Line chart** com **área preenchida** (area gradient) + **markers (dots)** em cada ponto.

## 9.2 Eixos

| Eixo | Conteúdo na ref. |
|------|------------------|
| Y (Faturamento) | Escala ~ **6100 → 7300**, ticks de 100 em 100 (6100, 6200… 7300) |
| X (Período) | Datas `DD/MM/YYYY`: 23/12/2025 … 14/12/2025 (10 pontos) |

> **Nota de implementação:** na demo a ordem visual parece decrescente no calendário da esquerda para a direita. No produto real, preferir **cronológico L→R (antigo → recente)** salvo decisão contrária (Open Question).

## 9.3 Série (valores aproximados da curva para mock visual)

| # | Data (label) | Valor ~ |
|---|--------------|---------|
| 1 | 23/12/2025 | 6350 |
| 2 | 22/12/2025 | 7100 |
| 3 | 21/12/2025 | 6150 |
| 4 | 20/12/2025 | 7070 |
| 5 | 19/12/2025 | 7250 |
| 6 | 18/12/2025 | 6450 |
| 7 | 17/12/2025 | 6280 |
| 8 | 16/12/2025 | 6850 |
| 9 | 15/12/2025 | 6250 |
| 10 | 14/12/2025 | 6430 |

Formato da curva: **3 picos** (alto–baixo–alto–baixo–médio–baixo–leve alta).

## 9.4 Estilo visual do chart

| Propriedade | Valor |
|-------------|--------|
| Stroke line | 2–2.5px, `--chart-line` |
| Curve | suave (`monotone` / `catmullRom`) |
| Dot radius | 4–5px |
| Dot fill | verde |
| Dot stroke | 2px fundo escuro |
| Area | linear gradient vertical verde → transparente |
| Grid | horizontal only, `--chart-grid` |
| Axis labels | 11–12px muted |
| Tooltip | bg elevated, valor BRL + data; hover no ponto |
| Background plot | transparente (mostra bg do card) |

## 9.5 Outras visualizações

| Tipo | Onde | Implementação |
|------|------|---------------|
| Progress ring | Conversão ×3 | SVG circular |
| Progress bar linear | Stats vendas ×3 + volume topbar | div track/fill |
| Rank list | Top products | lista, não chart |

## 9.6 Biblioteca

**Recharts** (recomendado) ou ApexCharts. Isolar em `RevenueLineChart` para trocar lib se necessário.

---

# 10. Estados de interface

| Estado | Comportamento visual |
|--------|----------------------|
| **Default** | Como screenshot |
| **Loading** | Skeleton dark shimmer nos 6 KPIs, 3 conv, chart, listas |
| **Empty** | Chart com eixos vazios + mensagem; listas com empty copy |
| **Error** | Banner/toast + CTA “Tentar novamente” na seção |
| **Hover card** | Border levemente mais clara |
| **Hover botão primary** | Brighten verde |
| **Hover nav** | bg card-hover (se inativo) |
| **Active nav** | pill verde |
| **Focus teclado** | ring 2px verde |
| **Disabled** | opacity 0.5, cursor not-allowed |
| **Dropdown open** | menu elevated abaixo do trigger |
| **Modal open** | overlay rgba(0,0,0,0.6) + dialog |

### Motion
- Ring e chart: animação suave no mount (300–600ms)
- Respeitar `prefers-reduced-motion: reduce`

---

# 11. Navegação e sitemap

## 11.1 Rotas

| Path | Página | Prioridade |
|------|--------|------------|
| `/` | Dashboard (parity total) | P0 |
| `/login` | Login dark | P0 |
| `/vitrine` | Placeholder | P1 |
| `/vendas` | Placeholder (+ subrotas P2) | P1 |
| `/financeiro` | Placeholder | P1 |
| `/clientes` | Placeholder | P1 |
| `/produtos` | Placeholder / lista | P1 |
| `/configuracoes` | Placeholder | P1 |
| `/integracoes` | Placeholder | P1 |
| `/dominios` | Placeholder | P1 |

## 11.2 Submenus sugeridos (P2)

| Pai | Filhos |
|-----|--------|
| Vendas | Transações, Links de pagamento, Checkout |
| Financeiro | Extrato, Saques, Antecipações, Taxas |
| Produtos | Lista, Categorias, Cupons |
| Configurações | Perfil, Empresa, Equipe, Segurança, Webhooks |

## 11.3 Shell

Todas as rotas autenticadas usam o **mesmo** `AppShell` (Topbar + Sidebar). Só o `children` muda.

---

# 12. Formatação de dados (pt-BR)

| Tipo | Regra | Exemplo |
|------|-------|---------|
| Moeda BRL | `R$` + milhar `.` + decimal `,` | `R$ 788.901,86` |
| Inteiro | milhar `.` se necessário | `162` |
| Percentual | inteiro + `%` | `90%` |
| Data curta | `DD/MM/YYYY` | `23/12/2025` |
| Compact volume | 1 casa + `K` / `M` | `880.9K` |
| Nome truncado | ellipsis CSS | `Marketing Digital Descomplicado…` |

```ts
// Exemplos de implementação
new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(788901.86)
new Intl.DateTimeFormat("pt-BR").format(date)
```

---

# 13. Dados mock da referência

```ts
export const dashboardMock = {
  user: {
    id: "1",
    name: "Igor Rocha",
    avatarUrl: null as string | null,
  },
  volume: { current: 880_900, goal: 950_000 },
  balances: {
    available: 788_901.86,
    pending: 197_225.46,
    held: 49_306.37,
  },
  metrics: {
    netProfit: 116_357.47,
    totalTransactions: 162,
    averageTicket: 397.54,
  },
  conversion: { pix: 90, boleto: 90, card: 90 },
  revenueHistory: [
    { date: "2025-12-23", amount: 6350 },
    { date: "2025-12-22", amount: 7100 },
    { date: "2025-12-21", amount: 6150 },
    { date: "2025-12-20", amount: 7070 },
    { date: "2025-12-19", amount: 7250 },
    { date: "2025-12-18", amount: 6450 },
    { date: "2025-12-17", amount: 6280 },
    { date: "2025-12-16", amount: 6850 },
    { date: "2025-12-15", amount: 6250 },
    { date: "2025-12-14", amount: 6430 },
  ],
  topProducts: [
    { rank: 1, name: "Produto 1", revenue: 488_424.04, imageUrl: null },
    { rank: 2, name: "Teste", revenue: 480_890.80, imageUrl: null },
    { rank: 3, name: "Gateway Academy", revenue: 419_622.44, imageUrl: "/mock/p3.png" },
    { rank: 4, name: "Curso virtual", revenue: 226_574.36, imageUrl: "/mock/p4.png" },
    { rank: 5, name: "Marketing Digital Descomplicado", revenue: 135_648.41, imageUrl: "/mock/p5.png" },
  ],
  salesByMethod: {
    pix: 35_064.43,
    card: 66_405.84,
    boleto: 5_743.07,
  },
};
```

---

# 14. Responsividade

| Breakpoint | Layout |
|------------|--------|
| **≥ 1440px** | 3 colunas fiéis à referência |
| **1280–1439** | Sidebar 240px; aside 280px; gaps menores |
| **1024–1279** | Aside empilha **abaixo** do main; sidebar fixa |
| **768–1023** | Sidebar ícones-only ou drawer; KPI **2 colunas** |
| **< 768** | Drawer nav; KPI/conv **1 coluna**; chart full; aside stack |

**Prioridade:** desktop parity primeiro; mobile usável na sequência.

---

# 15. Acessibilidade

| Requisito | Como |
|-----------|------|
| Contraste AA | tokens de texto validados |
| Foco visível | `outline` / ring verde |
| Botões ícone | `aria-label` |
| Nav | `nav` + `aria-current="page"` no ativo |
| Chart | tabela sr-only ou descrição + tooltip teclado |
| Rings | `aria-valuenow` / `role="progressbar"` |
| Modal | focus trap, ESC fecha, `role="dialog"` |
| Motion | `prefers-reduced-motion` |

---

# 16. Stack e estrutura de pastas

## 16.1 Stack recomendada

| Camada | Tecnologia |
|--------|------------|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| Primitives | shadcn/ui (tema custom dark/green) |
| Ícones | lucide-react |
| Charts | recharts |
| Font | Inter (next/font) |
| Validação | Zod |
| Forms | React Hook Form |
| Data fetching | TanStack Query (mock → API) |
| Linguagem | TypeScript strict |

## 16.2 Pastas

```
src/
  app/
    (auth)/login/page.tsx
    (dashboard)/
      layout.tsx                 # AppShell
      page.tsx                   # Dashboard
      vitrine/page.tsx
      vendas/page.tsx
      financeiro/page.tsx
      clientes/page.tsx
      produtos/page.tsx
      configuracoes/page.tsx
      integracoes/page.tsx
      dominios/page.tsx
  components/
    layout/
      AppShell.tsx
      Topbar.tsx
      Sidebar.tsx
      NavItem.tsx
      BrandLogo.tsx
      VolumeMeter.tsx
      UserMenu.tsx
      PageHeader.tsx
    dashboard/
      KpiCard.tsx
      KpiGrid.tsx
      ConversionCard.tsx
      ConversionGrid.tsx
      ProgressRing.tsx
      RevenueChartCard.tsx
      RevenueLineChart.tsx
      TopProductsCard.tsx
      ProductRankItem.tsx
      SalesStatsCard.tsx
      SalesStatItem.tsx
      PeriodFilter.tsx
      WithdrawModal.tsx
    ui/
      Button.tsx
      Card.tsx
      Avatar.tsx
      Skeleton.tsx
      Dropdown.tsx
      ProgressBar.tsx
      Badge.tsx
      Dialog.tsx
  lib/
    format/currency.ts
    format/date.ts
    format/compact.ts
    mock/dashboard.ts
    utils/cn.ts
  styles/
    globals.css                  # tokens + base
  types/
    dashboard.ts
docs/
  PRD-Frontend-Gateway-DarkPay.md
  design-tokens.css
```

---

# 17. Requisitos funcionais e não funcionais

## 17.1 Funcionais (Dashboard)

| ID | Requisito |
|----|-----------|
| RF-01 | Shell autenticado com Topbar + Sidebar |
| RF-02 | Saudação com nome do usuário |
| RF-03 | Filtro de período reativo (mock) |
| RF-04 | 6 KPIs com ícones e formatação BRL |
| RF-05 | 3 cards de conversão com ProgressRing |
| RF-06 | Gráfico de faturamento com tooltip |
| RF-07 | Top 5 produtos + “Ver todos” |
| RF-08 | Estatísticas por método com barras normalizadas |
| RF-09 | CTA Solicitar saque abre modal (UI) |
| RF-10 | Volume meter no header |
| RF-11 | User menu (perfil / config / sair) |
| RF-12 | Nav com estado ativo e chevrons de submenu |
| RF-13 | Formatação pt-BR em toda a UI |
| RF-14 | Loading skeletons + empty + error |
| RF-15 | Rotas placeholder para demais itens da nav |

## 17.2 Não funcionais

| ID | Requisito |
|----|-----------|
| RNF-01 | TypeScript strict |
| RNF-02 | Tokens centralizados (sem hex soltos) |
| RNF-03 | Dark sem flash de tema claro |
| RNF-04 | Performance Lighthouse desktop ≥ 90 (mock) |
| RNF-05 | Compat: Chrome, Firefox, Safari (2 últimas) |
| RNF-06 | CLS baixo em cards/chart |
| RNF-07 | Código componentizado e reutilizável |

---

# 18. Key Decisions

| ID | Decisão | Por quê |
|----|---------|--------|
| KD-01 | Dark-only v1 | Referência é dark; reduz escopo |
| KD-02 | Next + Tailwind + shadcn + Lucide + Recharts | Velocidade + qualidade de clone |
| KD-03 | CSS variables como source of truth | Troca de marca e tema controlada |
| KD-04 | Branding **Gateway DarkPay** no código | Evita copiar marca de terceiros |
| KD-05 | P0 = Dashboard parity + shell | Demo e base do produto |
| KD-06 | pt-BR obrigatório em números/datas | Mercado BR |
| KD-07 | ProgressRing custom SVG | Controle pixel-level |
| KD-08 | Cards flat (borda, não sombra) | Fiel à referência |
| KD-09 | Mock primeiro, API depois | Desbloqueia UI paralela ao backend |
| KD-10 | Chart isolado em um componente | Facilita calibração visual |

---

# 19. Open Questions

| ID | Pergunta | Default |
|----|----------|---------|
| OQ-01 | Nome no logo: DarkPay ou Gateway DarkPay? | Gateway DarkPay |
| OQ-02 | Confirma stack Next + Tailwind? | Sim |
| OQ-03 | Eixo X do chart: cronológico L→R ou espelhar screenshot? | **TRAVADO: ordem da imagem (23/12 → 14/12)** — ver SPEC |
| OQ-04 | Auth fase 1: mock ou real? | Mock |
| OQ-05 | Light mode no roadmap? | Não na v1 |
| OQ-06 | Submenus: só chevron visual ou rotas filhas já? | Chevron + placeholders |

---

# 20. PR Plan

| PR | Título | Depende de | Entrega |
|----|--------|------------|---------|
| **PR-01** | Bootstrap + design tokens | — | Next, Tailwind, `globals.css` tokens, fonte |
| **PR-02** | UI primitives | PR-01 | Button, Card, Avatar, Skeleton, ProgressBar, ProgressRing, Dropdown |
| **PR-03** | App shell (Sidebar + Topbar) | PR-02 | Nav 9 itens, logo, volume, user menu, layout |
| **PR-04** | Types + formatters + mock | PR-01 | Contrato Dashboard + dados da ref. |
| **PR-05** | KPI + Conversion grids | PR-03, PR-04 | 6 KPIs + 3 rings |
| **PR-06** | Revenue chart | PR-05 | Line/area chart |
| **PR-07** | Top products + Sales stats | PR-05 | Aside completa |
| **PR-08** | Period filter + Withdraw modal | PR-03, PR-04 | Ações do header |
| **PR-09** | Login mock + route guard | PR-03 | Entrada no app |
| **PR-10** | States + a11y + responsive | PR-05–08 | Skeletons, drawer, polish |
| **PR-11** | (Opcional) visual regression | PR-10 | Stories / screenshots |

**Ordem:** 01 → 02 → 03 → 04 → (05 ∥ 06 ∥ 07) → 08 → 09 → 10 → 11

---

# 21. Checklist de parity visual

Usar em 1440×900 lado a lado com a referência:

- [ ] Fundo app quase preto (`#0B0D10`)
- [ ] Cards radius ~16px, borda sutil, sem sombra forte
- [ ] Nav ativo = **pill verde sólido** + texto escuro
- [ ] 9 itens de sidebar na ordem correta + chevrons certos
- [ ] 6 KPIs com badges circulares e valores BRL
- [ ] 3 conversões com rings ~90%
- [ ] Chart: curva suave, dots, area gradient, grid horizontal
- [ ] Top 5 produtos, valores **verdes**, botão Ver todos full-width
- [ ] Stats: 3 métodos + barras proporcionais
- [ ] Topbar: logo + volume (estrela âmbar) + user
- [ ] Botões: Solicitar saque (outline) + período (filter)
- [ ] Tipografia: H1 forte, labels muted, números tabulares
- [ ] Sem scroll horizontal em ≥1280px
- [ ] Espaçamentos de grid consistentes (12–16 / 16–20)
- [ ] Zero hex fora de tokens no código final

---

# 22. Apêndices

## 22.1 Wireframe textual completo

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ [◆ Logo DarkPay]                    [★ 880.9K/950K ▓▓▓▓▓░]  [◉ Igor Rocha ▾]  │
├──────────────┬─────────────────────────────────────────────┬───────────────────┤
│ ■ Dashboard  │ Olá, Igor Rocha                             │ Produtos mais     │
│   Vitrine    │ Seja bem-vindo...    [Saque] [▾ Semana]     │ vendidos          │
│   Vendas   > │                                             │ #1 Produto1  R$   │
│   Financ.  > │ [Saldo disp.] [Pendente] [Retido]           │ #2 Teste     R$   │
│   Clientes   │ [Lucro]       [Tx 162]   [Ticket]           │ #3 Academy   R$   │
│   Produtos > │                                             │ #4 Curso     R$   │
│   Config   > │ [PIX ○90%] [Boleto ○90%] [Cartão ○90%]      │ #5 Mkt Dig.  R$   │
│   Integr.    │                                             │ [   Ver todos   ] │
│   Domínios   │ Histórico de faturamento                    ├───────────────────┤
│              │ [~~~~~~~~ line chart faturamento ~~~~~~~~]  │ Estatísticas      │
│              │                                             │ PIX    ████  R$   │
│              │                                             │ Cartão ██████ R$  │
│              │                                             │ Boleto █     R$   │
└──────────────┴─────────────────────────────────────────────┴───────────────────┘
```

## 22.2 Mapa rápido: o que é o quê

| Você vê na tela | Componente | Token principal |
|-----------------|------------|-----------------|
| Fundo preto | App background | `--bg-app` |
| Retângulos de métrica | `KpiCard` | `--bg-card` |
| Verde da nav / botões | accent | `--green-primary` |
| Anéis 90% | `ProgressRing` | `--green-ring` |
| Linha do gráfico | `RevenueLineChart` | `--chart-line` |
| Lista #1–#5 | `TopProductsCard` | valor em green |
| Barrinhas PIX/Cartão/Boleto | `SalesStatItem` | `--progress-fill` |
| Menu esquerdo | `Sidebar` | `--bg-sidebar` |
| “Olá, …” | `PageHeader` | `--text-2xl` |

## 22.3 Arquivos de suporte neste repositório

| Arquivo | Função |
|---------|--------|
| `docs/PRD-Frontend-Gateway-DarkPay.md` | Este PRD (fonte da verdade de UI) |
| `docs/design-tokens.css` | Tokens CSS prontos para copiar ao bootstrap |

## 22.4 Ordem de leitura para o time

1. Seções **2–8** (layout, cor, tipo, espaço, ícones, componentes, regiões)  
2. Seção **9** (gráfico)  
3. Seção **13** (mock)  
4. Seção **20** (PRs)  
5. Seção **21** (QA visual)

---

## Histórico do documento

| Versão | Data | Notas |
|--------|------|-------|
| 1.0.0 | 2026-07-10 | Primeira análise + PR plan |
| 2.0.0 | 2026-07-10 | Reorganização completa: inventário minucioso |
| **2.1.0** | **2026-07-10** | **Parity obrigatória:** imagem 1600×873 salva; `SPEC-PIXEL-PERFECT.md`; tokens e chart travados para clone idêntico |

---

*Fim do PRD — Frontend Gateway DarkPay. Use este documento como especificação única para recriar o front de forma idêntica e organizada.*
```
