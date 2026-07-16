# SPEC PIXEL-PERFECT — Dashboard idêntico à imagem de referência

| Campo | Valor |
|--------|--------|
| **Objetivo** | Recriar o frontend **exatamente igual** à imagem |
| **Arquivo de referência** | `docs/referencia-dashboard.jpg` |
| **Resolução da referência** | **1600 × 873 px** |
| **Viewport alvo de parity** | **1600 × 900** (ou 1600 × 873 com scroll mínimo) |
| **Regra de ouro** | Se divergir da imagem, a **imagem vence** |
| **Versão** | 1.0.0 |
| **Ligado ao** | `PRD-Frontend-Gateway-DarkPay.md` |

---

## 0. Como usar este documento

1. Abrir a referência e o app lado a lado em **1600px de largura**.
2. Implementar componente por componente seguindo as **medidas congeladas** abaixo.
3. Validar com o **checklist final** (seção 12).
4. Qualquer dúvida de “ficar bonito” vs “ficar igual” → **ficar igual**.

```
docs/referencia-dashboard.jpg  ←  fonte visual absoluta
docs/SPEC-PIXEL-PERFECT.md     ←  este arquivo (medidas + regras)
docs/PRD-Frontend-Gateway-DarkPay.md  ←  contexto produto + PRs
docs/design-tokens.css         ←  tokens no código
```

---

## 1. Layout global — proporções na referência 1600px

Medidas **estimadas por engenharia reversa visual** da imagem 1600×873.  
Tolerância de implementação: **±2px** em gaps internos; **±4px** em larguras de coluna.

### 1.1 Mapa de colunas (eixo X, da esquerda para a direita)

| Zona | X aprox. início | Largura aprox. | % da largura |
|------|-----------------|----------------|--------------|
| Sidebar | 0 | **220–236 px** | ~14% |
| Gutter sidebar→main | — | **20–28 px** | |
| Main content | ~250 | **~1000–1040 px** | ~64% |
| Gutter main→aside | — | **16–20 px** | |
| Aside direita | ~1280 | **~280–300 px** | ~18% |
| Padding direito da página | — | **16–24 px** | |

### 1.2 Mapa de linhas (eixo Y)

| Zona | Y aprox. | Altura aprox. |
|------|----------|---------------|
| Topbar | 0 | **56–60 px** |
| Espaço topbar → saudação | | **16–20 px** |
| Bloco saudação + botões | | **48–56 px** |
| Gap | | **14–18 px** |
| KPI row 1 | | **72–80 px** cards |
| Gap | | **12–14 px** |
| KPI row 2 | | **72–80 px** |
| Gap | | **12–14 px** |
| Conversão row | | **64–72 px** |
| Gap | | **14–18 px** |
| Chart card | | **~300–340 px** (até o rodapé da viewport) |

### 1.3 CSS de layout (contrato)

```css
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr var(--aside-width);
  grid-template-rows: var(--header-height) 1fr;
  min-height: 100vh;
  background: var(--bg-app);
}

/* Topbar ocupa as 3 colunas */
.topbar {
  grid-column: 1 / -1;
  height: var(--header-height); /* 58px */
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px 0 20px;
}

.sidebar {
  width: var(--sidebar-width); /* 228px */
  padding: 12px 12px;
  background: var(--bg-sidebar);
}

.main {
  padding: 20px 20px 24px 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.aside {
  width: var(--aside-width); /* 292px */
  padding: 20px 20px 24px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
```

**Tokens de layout CONGELADOS para parity:**

```css
--sidebar-width: 228px;
--aside-width: 292px;
--header-height: 58px;
--main-gap: 16px;
--kpi-gap: 12px;
--card-radius: 14px;
--card-padding: 16px;
```

---

## 2. Cores CONGELADAS (usar estes hex, não “aproximados”)

Calibração visual da referência dark + verde mint.  
Estes valores são a **fonte da verdade no código**.

```css
:root {
  /* Fundos */
  --bg-app: #0c0e12;
  --bg-sidebar: #0c0e12;
  --bg-card: #15181e;
  --bg-card-inner-icon: #1a1e26;
  --bg-elevated: #1c2028;
  --bg-button-ghost: #15181e;

  /* Bordas */
  --border-card: #1f2430;
  --border-ghost-btn: #2a3140;

  /* Verde (o mesmo em: nav ativa, CTA, chart, rings, valores ranking, barras) */
  --green: #00e676;          /* alvo primário da referência — mint brilhante */
  --green-alt: #12d66c;      /* fallback se #00e676 saturar demais em alguns monitores */
  --green-use: #00d66a;      /* valor de implementação UNIFICADO — calibrar 1x no monitor */
  --on-green: #0a0f0c;       /* texto/ícone sobre verde sólido */

  /* Texto */
  --text-1: #ffffff;
  --text-2: #a0a8b7;
  --text-3: #6d7585;
  --text-green: var(--green-use);

  /* Ícones */
  --icon-muted: #8b93a3;
  --icon-green: var(--green-use);
  --star-amber: #f5a623;

  /* Chart */
  --chart-line: var(--green-use);
  --chart-grid: #1c222d;
  --chart-axis: #6d7585;
  --chart-fill: rgba(0, 214, 106, 0.18);

  /* Progress */
  --track: #232a36;
  --fill: var(--green-use);
}
```

### 2.1 Regra de cor — o que é verde vs branco na imagem

| Elemento | Cor na imagem |
|----------|----------------|
| Fundo página | preto-azul escuro |
| Cards | cinza escuro elevado |
| Item nav **Dashboard** | **fundo verde sólido** |
| Texto/ícone no Dashboard ativo | **escuro** (quase preto) |
| Texto nav inativa | cinza claro |
| Labels KPI (“Saldo disponível”) | cinza médio |
| Valores KPI (`R$ 788…`) | **branco** |
| Valores ranking produtos | **verde** |
| Botão “Ver todos” | fundo **verde**, texto **escuro** |
| Botão “Solicitar saque” | **borda + texto verde**, fundo transparente/card |
| Botão “Última semana” | fundo card, texto cinza, ícone funil |
| Linha do gráfico | verde |
| Dots do gráfico | verde |
| Anéis 90% | stroke verde, track cinza |
| Barras stats | fill verde, track cinza |
| Estrela volume | **âmbar/dourado** (não verde) |
| Texto “880.9K / 950K” | branco/cinza claro |

---

## 3. Tipografia CONGELADA (igual à hierarquia da imagem)

```css
font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
```

| Papel | Size | Weight | Color | Letter-spacing | Match na imagem |
|-------|------|--------|-------|----------------|-----------------|
| Logo wordmark | 15px | 700 | #fff | -0.01em | “Gateway.FY” |
| Logo tagline | 8px | 600 | #6d7585 | 0.12em | “PAYMENT SOLUTIONS” uppercase |
| H1 saudação | **26px** | 700 | #fff | -0.02em | “Olá, Igor Rocha” |
| Subtitle welcome | **13px** | 400 | #a0a8b7 | 0 | “Seja bem-vindo…” |
| KPI label | **12px** | 400 | #a0a8b7 | 0 | “Saldo disponível” |
| KPI value | **18px** | 700 | #fff | 0 | “R$ 788.901,86” + tabular-nums |
| Section title | **15px** | 600 | #fff | 0 | “Histórico de faturamento” / “Produtos mais vendidos” |
| Section sub | **12px** | 400 | #6d7585 | 0 | “Acompanhe o histórico…” |
| Nav item | **13.5px** | 500 | #c4cad6 | 0 | inativos |
| Nav item active | **13.5px** | 600 | #0a0f0c | 0 | “Dashboard” |
| Button | **13px** | 600 | — | 0 | saque / período / ver todos |
| Rank #n | **12px** | 500 | #6d7585 | 0 | “#1” |
| Product name | **13px** | 500 | #fff | 0 | |
| Product $ | **13px** | 600 | **verde** | 0 | |
| Stat label | **13px** | 500 | #fff | 0 | “PIX” |
| Stat $ | **13px** | 500 | #fff | 0 | |
| Ring % | **11px** | 600 | verde | 0 | “90%” |
| Chart axis | **10–11px** | 400 | #6d7585 | 0 | datas e números Y |
| Volume text | **12px** | 500 | #e8eaed | 0 | “880.9K / 950K” |
| User name | **13px** | 500 | #e8eaed | 0 | “Igor Rocha” |

```css
.kpi-value, .money, .volume-text {
  font-variant-numeric: tabular-nums;
}
```

---

## 4. Textos EXATOS (copiar literalmente)

### 4.1 Brand (substituir só o nome se for DarkPay; layout igual)

```
Gateway.FY          →  (clone: Gateway DarkPay ou marca final)
PAYMENT SOLUTIONS
```

### 4.2 Topbar

```
880.9K / 950K
Igor Rocha
```

### 4.3 Header main

```
Olá, Igor Rocha
Seja bem-vindo ao painel de controle da sua empresa
Solicitar saque
Última semana
```

### 4.4 KPIs (label + valor)

```
Saldo disponível     R$ 788.901,86
Saldo pendente       R$ 197.225,46
Saldo retido         R$ 49.306,37
Lucro líquido        R$ 116.357,47
Total de Transações  162
Ticket médio         R$ 397,54
```

### 4.5 Conversão

```
Conversão por PIX      90%
Conversão por boleto   90%
Conversão por cartão   90%
```

### 4.6 Chart

```
Histórico de faturamento
Acompanhe o histórico de transações do seu negócio
Faturamento   (eixo Y)
Período       (eixo X, centro-baixo)
```

**Labels eixo X na ordem EXATA da imagem (esquerda → direita):**

```
23/12/2025 | 22/12/2025 | 21/12/2025 | 20/12/2025 | 19/12/2025 |
18/12/2025 | 17/12/2025 | 16/12/2025 | 15/12/2025 | 14/12/2025
```

> ⚠️ Na imagem o eixo X está **do mais recente para o mais antigo** (23 → 14).  
> Para ficar **igual à imagem**, o mock deve seguir essa ordem na plotagem.

**Ticks eixo Y (visível na imagem):**

```
7300, 7100, 7000, 6900, 6800, 6700, 6600, 6500, 6400, 6300, 6100
```
(intervalo ~100; domain sugerido **6100–7300**)

### 4.7 Produtos

```
Produtos mais vendidos
#1  Produto 1                              R$ 488.424,04
#2  Teste                                  R$ 480.890,80
#3  Gateway Academy                        R$ 419.622,44
#4  Curso virtual                          R$ 226.574,36
#5  Marketing Digital Descomplicado...     R$ 135.648,41
Ver todos
```

### 4.8 Stats

```
Estatísticas de vendas
PIX                 R$ 35.064,43
Cartão de crédito   R$ 66.405,84
Boleto              R$ 5.743,07
```

### 4.9 Sidebar (ordem e labels EXATOS)

```
1. Dashboard
2. Vitrine
3. Vendas          >
4. Financeiro      >
5. Clientes
6. Produtos        >
7. Configurações   >
8. Integrações
9. Domínios
```

---

## 5. Ícones — mapa 1:1 com a imagem

| Local | Visual na imagem | Implementar com |
|-------|------------------|-----------------|
| Logo | 4 nós ligados (network) verde | SVG custom (não Lucide) |
| Dashboard | casa | `Home` |
| Vitrine | loja/vitrine | `Store` |
| Vendas | sacola | `ShoppingBag` |
| Financeiro | documento | `FileText` |
| Clientes | 2 pessoas | `Users` |
| Produtos | caixa | `Package` |
| Configurações | engrenagem | `Settings` |
| Integrações | plug | `Plug` |
| Domínios | globo | `Globe` |
| Chevron submenu | `>` fino | `ChevronRight` size 14 |
| Volume | estrela preenchida dourada | `Star` fill `#f5a623` |
| User | chevron down | `ChevronDown` |
| Período | funil | `Filter` |
| KPI $ | cifrão em círculo | `DollarSign` |
| KPI clock | relógio em círculo | `Clock` |
| KPI swap | setas ↔ | `ArrowLeftRight` |
| KPI % | percentual | `Percent` |
| PIX | losango 4 pontas (marca) | SVG PIX-like / `Diamond` |
| Boleto | 3–4 barras verticais | custom bars / `Barcode` |
| Cartão | cartão retangular | `CreditCard` |
| Produto sem foto | cubo isométrico cinza | `Box` em fundo `#1a1e26` |

**Tamanhos CONGELADOS:**

| Contexto | px |
|----------|-----|
| Nav icon | 18 |
| KPI icon dentro do círculo | 16 |
| KPI círculo | 34 |
| Conversão icon | 16–18 |
| Ring externo | 48 |
| Ring stroke | 4 |
| Thumb produto | 32 |
| Avatar | 32 |
| Star volume | 14 |
| Filter / chevron | 14–16 |

**Stroke Lucide:** `strokeWidth={1.75}`

---

## 6. Componentes — anatomia idêntica à imagem

### 6.1 Nav item ATIVO (Dashboard)

```
┌─────────────────────────────┐
│  🏠  Dashboard              │  ← altura ~40px
└─────────────────────────────┘
  bg: var(--green-use)
  color: var(--on-green)
  border-radius: 10px
  padding: 10px 12px
  icon + gap 10px + label
  SEM chevron
```

### 6.2 Nav item INATIVO

```
  🏪  Vitrine
  color: #a0a8b7 / #c4cad6
  hover: bg rgba(255,255,255,0.03)
  se tem submenu: chevron right alinhado à direita, cor #6d7585
  padding: 10px 12px
  border-radius: 10px
```

### 6.3 KpiCard

```
┌──────────────────────────────────┐
│  ┌────┐  Saldo disponível        │
│  │ $  │  R$ 788.901,86           │
│  └────┘                          │
└──────────────────────────────────┘
height: ~76px
padding: 14px 16px
border-radius: 14px
bg: #15181e
border: 1px solid #1f2430
grid: 3 colunas iguais, gap 12px

Ícone:
  circle 34×34
  bg: #1a1e26
  icon verde 16px centralizado

Label: 12px #a0a8b7, acima do valor
Value: 18px #fff bold
```

### 6.4 ConversionCard

```
┌────────────────────────────────────────────┐
│  ◆  Conversão por PIX              ╭───╮   │
│                                    │90%│   │
│                                    ╰───╯   │
└────────────────────────────────────────────┘
height: ~68px
padding: 12px 16px
layout: flex; align center; justify space-between
esquerda: icon verde + label 13px #c4cad6
direita: ProgressRing 48px, stroke 4, value 90, track #232a36, fill verde
texto central do ring: 11px semibold verde
```

### 6.5 Botões (iguais à imagem)

**Solicitar saque (outline)**
```
height: 36px
padding: 0 14px
border-radius: 8px
border: 1px solid var(--green-use)
color: var(--green-use)
background: transparent
font: 13px/1 600
```

**Última semana (ghost/filter)**
```
height: 36px
padding: 0 12px
border-radius: 8px
border: 1px solid #2a3140
background: #15181e
color: #a0a8b7
icon Filter 14px à esquerda, gap 6px
```

**Ver todos (primary full)**
```
height: 40px
width: 100%
border-radius: 10px
background: var(--green-use)
color: var(--on-green)
font: 13px/1 600
border: none
margin-top: 12px
```

### 6.6 ProductRankItem

```
[#1] [thumb 32] [nome ........] [R$ verde]
altura row: ~44px
gap: 10px
#rank: width 22px, cor #6d7585
nome: truncate 1 linha, ellipsis
valor: white-space nowrap, cor verde, 13px 600
thumb: radius 8px; se sem imagem, bg #1a1e26 + Box icon
```

### 6.7 SalesStatItem

```
[icon] PIX                    R$ 35.064,43
       ████████████░░░░
row gap vertical entre items: 14px
barra height: 4px
barra radius: 99px
track: #232a36
fill: verde
largura fill = value / max(pix,card,boleto) * 100%
  → Cartão = 100%
  → PIX ≈ 52.8%
  → Boleto ≈ 8.6%
```

### 6.8 VolumeMeter

```
[★] 880.9K / 950K
[████████████░░]  bar ~100px × 4px
estrela: fill #f5a623, size 14
texto: 12px
progress: current/goal = 880900/950000 ≈ 92.7%
```

### 6.9 UserMenu

```
[avatar 32 circular] Igor Rocha ▾
gap 8px
avatar: borda sutil ou ring verde muito leve (na imagem há glow verde no avatar)
```

---

## 7. Gráfico — copiar a curva da imagem

### 7.1 Dados CONGELADOS (ordem plot L→R = ordem da imagem)

```ts
export const revenueHistoryExact = [
  { date: "2025-12-23", label: "23/12/2025", amount: 6360 },
  { date: "2025-12-22", label: "22/12/2025", amount: 7100 },
  { date: "2025-12-21", label: "21/12/2025", amount: 6160 },
  { date: "2025-12-20", label: "20/12/2025", amount: 7080 },
  { date: "2025-12-19", label: "19/12/2025", amount: 7260 },
  { date: "2025-12-18", label: "18/12/2025", amount: 6460 },
  { date: "2025-12-17", label: "17/12/2025", amount: 6280 },
  { date: "2025-12-16", label: "16/12/2025", amount: 6840 },
  { date: "2025-12-15", label: "15/12/2025", amount: 6250 },
  { date: "2025-12-14", label: "14/12/2025", amount: 6430 },
];
```

### 7.2 Forma da curva (validação visual)

```
Y
7300|              • peak (~7260)
7100|     •                    •
6900|
6700|
6500|•                           •         •
6300|                              •    •
6100|           •
    +--------------------------------------→ X
     23  22  21  20  19  18  17  16  15  14
```

Picos: **22**, **20–19**, **16**  
Vales: **21**, **17–15**, com recuperação leve em **14**

### 7.3 Props de estilo (Recharts)

```ts
{
  type: "monotone",
  stroke: "var(--green-use)",
  strokeWidth: 2.5,
  dot: { r: 4, fill: "var(--green-use)", stroke: "#0c0e12", strokeWidth: 2 },
  activeDot: { r: 5 },
  fill: "url(#revenueGradient)", // #00d66a @ 25% → 0%
  grid: { stroke: "#1c222d", vertical: false },
  yDomain: [6100, 7300],
  xAxisTick: { fill: "#6d7585", fontSize: 10 },
  yAxisTick: { fill: "#6d7585", fontSize: 10 },
  yAxisLabel: "Faturamento",
  xAxisLabel: "Período",
  height: 260,
  margin: { top: 8, right: 12, left: 0, bottom: 8 },
}
```

---

## 8. Espaçamento — matriz rápida

| Entre | px |
|-------|-----|
| Itens da sidebar | 2–4 (pelo padding do item) |
| KPI cards (gap) | **12** |
| Conversion cards (gap) | **12** |
| Blocos verticais main | **16** |
| PageHeader e primeiro grid | **16** |
| Icon badge e textos KPI | **12** |
| Rows de produto | **12** |
| Stats rows | **14** |
| Card padding | **16** |
| Aside cards gap | **16** |
| Botões header (saque | filtro) | **8** |

---

## 9. Radius — matriz rápida

| Elemento | radius |
|----------|--------|
| Card (KPI, chart, aside) | **14px** |
| Nav active pill | **10px** |
| Botão primary/outline | **8–10px** |
| Thumb produto | **8px** |
| Avatar | **999px** |
| Progress bar / volume bar | **999px** |
| Icon badge KPI | **999px** |

---

## 10. Mock JSON único (colar no código)

```json
{
  "user": { "name": "Igor Rocha", "avatarUrl": null },
  "volume": { "current": 880900, "goal": 950000 },
  "balances": {
    "available": 788901.86,
    "pending": 197225.46,
    "held": 49306.37
  },
  "metrics": {
    "netProfit": 116357.47,
    "totalTransactions": 162,
    "averageTicket": 397.54
  },
  "conversion": { "pix": 90, "boleto": 90, "card": 90 },
  "revenueHistory": [
    { "date": "2025-12-23", "amount": 6360 },
    { "date": "2025-12-22", "amount": 7100 },
    { "date": "2025-12-21", "amount": 6160 },
    { "date": "2025-12-20", "amount": 7080 },
    { "date": "2025-12-19", "amount": 7260 },
    { "date": "2025-12-18", "amount": 6460 },
    { "date": "2025-12-17", "amount": 6280 },
    { "date": "2025-12-16", "amount": 6840 },
    { "date": "2025-12-15", "amount": 6250 },
    { "date": "2025-12-14", "amount": 6430 }
  ],
  "topProducts": [
    { "rank": 1, "name": "Produto 1", "revenue": 488424.04, "imageUrl": null },
    { "rank": 2, "name": "Teste", "revenue": 480890.80, "imageUrl": null },
    { "rank": 3, "name": "Gateway Academy", "revenue": 419622.44, "imageUrl": "mock" },
    { "rank": 4, "name": "Curso virtual", "revenue": 226574.36, "imageUrl": "mock" },
    { "rank": 5, "name": "Marketing Digital Descomplicado", "revenue": 135648.41, "imageUrl": "mock" }
  ],
  "salesByMethod": {
    "pix": 35064.43,
    "card": 66405.84,
    "boleto": 5743.07
  }
}
```

---

## 11. Decisões TRAVADAS para ficar igual à imagem

| Tema | Decisão |
|------|---------|
| Tema | Dark only |
| Eixo X do chart | **Ordem da imagem** (23/12 → 14/12) |
| Conversão | Todos **90%** no mock de parity |
| Nav ativa | Pill verde sólido + texto escuro |
| Valores ranking | Verde |
| Valores KPI | Branco |
| Formato dinheiro | pt-BR com `R$` |
| Sombra nos cards | **Não** (só borda) |
| Light mode | Não |
| Viewport de QA | **1600px** largura |

---

## 12. Checklist de aceite — “exatamente igual”

Fazer em **1600px** com a referência aberta:

### Shell
- [ ] Topbar altura ~58px, logo esq., volume + user dir.
- [ ] Estrela do volume **âmbar**, não verde
- [ ] Sidebar ~228px, 9 itens, ordem correta
- [ ] Dashboard com **pill verde** e ícone/texto escuros
- [ ] Chevrons só em: Vendas, Financeiro, Produtos, Configurações

### Main
- [ ] “Olá, Igor Rocha” 26px bold branco
- [ ] Subtitle cinza exato
- [ ] Dois botões à direita (outline verde + ghost filter)
- [ ] 6 KPIs em 3×2, gaps 12px, ícones em círculo
- [ ] Números BRL idênticos ao mock
- [ ] 3 conversões com rings 90% à direita de cada card

### Chart
- [ ] Título + subtítulo corretos
- [ ] Curva com 3 picos no mesmo lugar
- [ ] Dots visíveis em cada ponto
- [ ] Area fill suave sob a linha
- [ ] Labels X: 23/12 … 14/12 na ordem da imagem
- [ ] Y domain ~6100–7300

### Aside
- [ ] Top 5 com ranks, thumbs, valores verdes
- [ ] “Ver todos” full-width verde
- [ ] Stats: PIX / Cartão / Boleto com barras proporcionais
- [ ] Cartão tem a barra mais longa; boleto a mais curta

### Geral
- [ ] Sem sombra “Material” nos cards
- [ ] Verde unificado em CTAs, chart, rings, ranking, barras
- [ ] Sem scroll horizontal
- [ ] Diff visual aceitável: “parece a mesma tela”

### Score de parity
| Nota | Critério |
|------|----------|
| 100% | Indistinguível no screenshot 1600px |
| ≥95% | Aceite de merge para v1 |
| <95% | Ajustar tokens/spacing até ≥95% |

---

## 13. Processo de calibração (quando for codar)

1. Implementar shell com tokens desta SPEC.  
2. Plugar mock JSON da seção 10.  
3. Screenshot do app a 1600px.  
4. Overlay 50% opacidade em cima de `referencia-dashboard.jpg`.  
5. Ajustar **só** spacing/radius/green hex até o overlay fechar.  
6. Congelar tokens finais em `design-tokens.css`.

---

## 14. Relação com o PRD

| Documento | Papel |
|-----------|--------|
| **SPEC-PIXEL-PERFECT.md** (este) | Como ficar **igual à imagem** (medidas, textos, mock, checklist) |
| **PRD-Frontend-…md** | Produto, stack, PRs, a11y, roadmap |
| **design-tokens.css** | Tokens no código (atualizar após calibração overlay) |
| **referencia-dashboard.jpg** | Ground truth visual |

---

*Se algo no código “melhorar” o design mas afastar da imagem, reverter. O objetivo desta fase é **clonar a referência**, não reinterpretá-la.*
```
