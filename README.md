# Gateway DarkPay

Clone visual pixel-faithful do dashboard de gateway de pagamentos (dark + verde), baseado em:

- `docs/referencia-dashboard.jpg`
- `docs/PRD-Frontend-Gateway-DarkPay.md`
- `docs/SPEC-PIXEL-PERFECT.md`

## Stack

- Next.js (App Router)
- React 19
- TypeScript
- Tailwind CSS 3
- Lucide icons
- Recharts

## Modo REAL (sem demo)

Guia: **[docs/SETUP-REAL.md](docs/SETUP-REAL.md)** · Dossiê: [docs/DOSSIE-MVP.md](docs/DOSSIE-MVP.md)

```bash
# 1) MySQL (Docker Desktop instalado)
npm run db:up
# aguarde ~25s

# 2) Usuários reais com senha
npm run db:seed

# 3) App
npm run dev
```

| Conta | Senha |
|-------|--------|
| `admin@darkpay.app` | `DarkPay@123` |
| `igor@darkpay.app` | `DarkPay@123` |

Login/logout usam **MySQL + cookie**. Sem banco = erro (não entra em “modo fake”).

## Como rodar (dev)

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd Gateway-DarkPay
cp .env.example .env
mysql -u root -p < darkpay.sql
npm install && npx prisma generate
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

### Banco MySQL

- Schema: **`darkpay.sql`**
- Mapa UI → tabelas: `docs/architecture/DATABASE-MAP.md`

```env
DATABASE_URL=mysql://user:senha@localhost:3306/darkpay
NEXT_PUBLIC_DARKPAY_DATA_MODE=http
SESSION_SECRET=min-32-chars-aleatorios
```

Viewport de QA recomendado: **1600 × 900**.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Dev server |
| `npm run build` | Build produção (`prisma generate` + Next) |
| `npm run start` | Serve build |
| `npm run db:push` | Aplica schema no Postgres |
| `npm run db:migrate` | Migrações Prisma |
| `npm run db:studio` | Prisma Studio |
| `node scripts/shot-dashboard.mjs` | Screenshot Playwright 1600px (dev rodando) |

## Estrutura

```
src/
  app/                  # rotas App Router (seller + admin + API)
  components/
    layout/             # Sidebar, AppShell, BrandLogo, PageHeader...
    dashboard/          # KPIs, chart, banner, métricas
    admin/              # painel admin
    integracoes/        # PodPay, webhooks, API...
    auth/               # login, registro, senha
  lib/
    acquirers/podpay/   # client, gateway, mappers
    mock/               # dados de desenvolvimento
    format.ts           # BRL / datas pt-BR
docs/
  architecture/        # planos e integração PodPay
  referencia-dashboard.jpg
  PRD-Frontend-Gateway-DarkPay.md
  SPEC-PIXEL-PERFECT.md
```

## Parity visual

1. Abrir referência e app em 1600px
2. Comparar com `docs/screenshots/dashboard-1600.png`
3. Checklist em `docs/SPEC-PIXEL-PERFECT.md` §12
