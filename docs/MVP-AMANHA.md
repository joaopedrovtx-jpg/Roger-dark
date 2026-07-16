# MVP amanhã — o que fazer

## Meta
Subir um **MVP fechado** (beta com 1–3 clientes) com:
- Login/registro reais no MySQL  
- Cookie de sessão  
- Rotas protegidas  
- Admin + seller usáveis  
- PodPay opcional (sandbox)

## Contas seed (após `darkpay.sql`)

| E-mail | Senha | Perfil |
|--------|-------|--------|
| `admin@darkpay.app` | `DarkPay@123` | Admin |
| `igor@darkpay.app` | `DarkPay@123` | Seller |

**Troque as senhas em produção.**

## Checklist (ordem)

### Hoje (você)
1. [ ] MySQL no ar (local ou cloud: RDS, PlanetScale, Railway…)
2. [ ] `mysql -u USER -p < darkpay.sql`
3. [ ] Criar `.env` na raiz:

```env
DATABASE_URL=mysql://USER:SENHA@HOST:3306/darkpay
SESSION_SECRET=uma-string-longa-aleatoria-32chars
NEXT_PUBLIC_DARKPAY_DATA_MODE=http
PODPAY_API_KEY=sk_test_...
PODPAY_ENV=sandbox
PODPAY_POSTBACK_BASE_URL=https://seu-dominio.com
NODE_ENV=production
```

4. [ ] `npm install && npx prisma generate && npm run build && npm start`
5. [ ] Testar: login admin → `/admin` · login seller → `/` · registro novo seller
6. [ ] Deploy (Vercel/Railway/VPS) + mesmas env vars + HTTPS
7. [ ] Webhook PodPay apontando para `https://dominio/api/v1/webhooks/podpay`

### Já implementado no código (agora)
- [x] Auth MySQL + bcrypt (`src/lib/server/auth.ts`)
- [x] Login / registro / logout / me
- [x] Cookie `httpOnly`
- [x] `middleware.ts` protege painel e APIs
- [x] Seeds com senha hash
- [x] Admin APIs + gravação MySQL
- [x] Build Next.js OK

### Pode ficar para a semana (não bloqueia beta)
- 2FA real, e-mail, upload S3  
- HMAC webhook PodPay  
- Criptografar chaves no DB  
- Dashboard seller 100% SQL (ainda mistura mock em alguns cards)  
- Rate limit / Sentry  

## Escopo MVP “bom o suficiente”
| Incluir | Excluir do amanhã |
|---------|-------------------|
| Login, registro, admin básico | App mobile |
| Ver saldos/mock + saque pedido | Contabilidade fiscal |
| Credenciais PodPay sandbox | Multi-tenant white-label completo |
| Aprovar saque no admin | KYC automático IA |
| Personalização logo/banner | SLA 99.99% |

## Testes manuais (15 min)
1. Abrir `/login` sem cookie → OK  
2. Login errado → erro  
3. Login `admin@darkpay.app` / `DarkPay@123` → `/admin`  
4. Cards admin carregam (mysql ou mock)  
5. Usuários → Ver → salvar taxas  
6. Saques → Ver → Aprovar (se houver pendente)  
7. Logout → volta login  
8. Registro novo seller → status pendente  
9. Seller `igor@...` → dashboard  

## Se algo falhar
| Sintoma | Ação |
|---------|------|
| “Banco indisponível” | Conferir `DATABASE_URL` e MySQL |
| Loop no login | Cookie bloqueado? HTTPS em prod + `secure` |
| 401 em tudo | Middleware: limpar cookies e logar de novo |
| Admin vazio | Rodar `darkpay.sql` completo de novo |
