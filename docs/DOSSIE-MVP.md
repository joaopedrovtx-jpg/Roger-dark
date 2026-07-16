# Dossiê MVP DarkPay — pronto para teste com amigos

**Data:** 2026-07-15  
**Objetivo:** beta fechado (receber transações / validar fluxo)  
**Build:** `next build` com middleware + auth + APIs admin

---

## 1. O que foi feito nesta rodada

### Segurança / Auth
| Item | Status |
|------|--------|
| Login / registro / logout / me (MySQL + bcrypt) | ✅ |
| Cookie `httpOnly` `darkpay_session` | ✅ |
| Middleware protege painel + APIs | ✅ |
| `requireAdmin` em **todas** APIs `/api/v1/admin/*` | ✅ |
| Seller APIs usam sessão (não mais `usr_01` hardcoded) | ✅ |
| 2FA TOTP real (`otplib` + `/api/v1/auth/2fa`) | ✅ |
| E-mail opcional (Resend ou log) | ✅ |

### Seller (sem mock quando MySQL OK)
| Item | Status |
|------|--------|
| Dashboard `/api/v1/dashboard` → MySQL | ✅ |
| Financeiro `/api/v1/finance` → MySQL | ✅ |
| Transações `/api/v1/transactions` → MySQL | ✅ |
| Saque pedido POST `/api/v1/withdrawals` → MySQL | ✅ |
| UI Dashboard + Transações buscam API | ✅ |

### Admin
| Item | Status |
|------|--------|
| Dashboard / users / saques / managers / acquirers | ✅ leitura |
| PATCH status, taxas, docs, credenciais, branding | ✅ gravação |
| Role admin obrigatório | ✅ |

### PodPay / webhooks
| Item | Status |
|------|--------|
| HMAC se `PODPAY_WEBHOOK_SECRET` | ✅ |
| Espelho webhook → MySQL (TX / saque / charge) | ✅ |
| Health `/api/health` | ✅ |

### Banco
| Item | Status |
|------|--------|
| `darkpay.sql` completo + seeds + senhas | ✅ |
| Prisma MySQL | ✅ |
| Contas: admin@ / igor@ · senha `DarkPay@123` | ✅ |

---

## 2. Como subir para os amigos testarem (amanhã)

```bash
# 1) Banco
mysql -u USER -p < darkpay.sql

# 2) Env
cp .env.example .env
# edite DATABASE_URL, SESSION_SECRET, PODPAY_API_KEY (sandbox)

# 3) App
npm install
npx prisma generate
npm run build
npm start
# ou deploy Vercel/Railway com as mesmas env + HTTPS
```

### Contas de teste
| E-mail | Senha | Papel |
|--------|--------|--------|
| `admin@darkpay.app` | `DarkPay@123` | Admin |
| `igor@darkpay.app` | `DarkPay@123` | Seller |
| (registro) | a escolher | Seller pendente |

### PodPay (receber PIX de verdade em sandbox)
1. Crie conta PodPay sandbox → `sk_test_…`
2. `.env`: `PODPAY_API_KEY`, `PODPAY_ENV=sandbox`
3. `PODPAY_POSTBACK_BASE_URL=https://SEU-DOMINIO.com`
4. Dashboard PodPay: webhook → `https://SEU-DOMINIO.com/api/v1/webhooks/podpay`
5. Admin → Adquirentes → Credenciais → salvar chave PodPay  
6. Seller → Integrações → Pagamentos / PodPay → criar cobrança  
7. Pagar no sandbox PodPay → webhook atualiza status

### Healthcheck
`GET https://seu-dominio.com/api/health`  
Esperado: `{ ok: true, database: "ok", podpay: true/false }`

---

## 3. Fluxos validados no código

1. **Login admin** → cookie → `/admin` → APIs 403 se não admin  
2. **Login seller** → dashboard com saldos MySQL  
3. **Registro** → user `pendente` + e-mail log/Resend  
4. **Saque seller** → debita `balanceAvailable` + linha `withdrawals`  
5. **Admin aprova/recusa saque** → MySQL + auditoria  
6. **Webhook PodPay** → HMAC + update TX/saque  
7. **2FA** → secret TOTP real no app autenticador  

---

## 4. Limitações conscientes do beta

| Item | Nota |
|------|------|
| Esqueci senha | Ainda mock de e-mail (não token persistido full flow) |
| Live PodPay | Use sandbox amanhã; live só com `sk_live` + secret HMAC |
| Chaves no DB | Texto (criptografar depois) |
| Upload docs | Preview local / URL, sem S3 |
| Multi-instância | Sessões no MySQL OK; rate limit ainda não |
| Dashboard seller sem vendas | Cards zerados/baixos — normal com seed |

---

## 5. Auditoria de bugs corrigidos

| Bug / falha | Correção |
|-------------|----------|
| Login mock sem cookie → middleware bloqueava | Auth via BFF + cookie |
| APIs admin abertas | `requireAdmin` em todas |
| Finance/withdrawals forçavam `usr_01` | Seller da sessão |
| Dashboard seller 100% mock | `/api/v1/dashboard` + MySQL |
| Transações só mock | API + UI fetch |
| Saque só memory | `createSellerWithdrawalDb` |
| Webhook sem HMAC / sem MySQL | `verifyPodPaySignature` + mirror Prisma |
| Branding PUT sem auth | `requireAdmin` |
| `/api/health` bloqueado | middleware public |
| 2FA só mock local | API TOTP + otplib |
| Senhas seed NULL | bcrypt `DarkPay@123` no SQL |
| Admin route syntax (params) | signatures corrigidas |

---

## 6. Checklist final (você)

- [ ] MySQL importado (`darkpay.sql`)
- [ ] `.env` com `DATABASE_URL` + `SESSION_SECRET` (≥32)
- [ ] `npm run build && npm start` sem erro
- [ ] `/api/health` → `database: "ok"`
- [ ] Login admin + seller
- [ ] Seller: pedir saque (valor < saldo)
- [ ] Admin: aprovar saque
- [ ] (Opcional) PodPay sandbox cobrança + webhook
- [ ] Trocar senhas seed antes de convidar muita gente
- [ ] HTTPS no domínio público

---

## 7. Estrutura relevante

```
src/lib/server/auth.ts          → login/registro/sessão
src/lib/server/guards.ts        → requireAuth / requireAdmin
src/lib/server/db/admin.service.ts
src/lib/server/db/seller.service.ts
src/lib/server/hmac.ts          → webhook PodPay
src/lib/server/totp.ts          → 2FA
src/lib/server/email.ts         → Resend/log
src/middleware.ts               → proteção de rotas
darkpay.sql                     → schema + seeds
docs/MVP-AMANHA.md
docs/DATABASE-MAP.md
docs/DOSSIE-MVP.md              → este arquivo
```

## 8. Veredito

| Critério | Status |
|----------|--------|
| Pronto para **amigos testarem** (login, painel, saque, admin) | **SIM** (com MySQL + env) |
| Pronto para **receber PIX sandbox** | **SIM** (com chave PodPay + URL pública) |
| Pronto para **produção bancária open** | **NÃO** (ainda beta; falta hardening full) |

**Conclusão:** com MySQL importado e `.env` certo, o app está **apto a beta de teste amanhã**.  
Não é produto financeiro certificado; é MVP funcional para validar fluxo de dinheiro em sandbox.
