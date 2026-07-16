# DarkPay REAL — autenticação e dados de verdade

## O que está valendo agora (sem Docker)

Nesta máquina **não há MySQL/Docker**. O app usa **SQLite real** em `prisma/dev.db`:

- Login / logout com senha bcrypt  
- Sessão no banco + cookie + Bearer  
- Seller, admin, cobranças, saques no arquivo SQLite  

## Setup em 3 comandos

```bash
cd Gateway-DarkPay
npm run setup    # prisma generate + db push + seed
npm run dev
```

## Contas

| E-mail | Senha | Papel |
|--------|--------|--------|
| `admin@darkpay.app` | `DarkPay@123` | Admin |
| `igor@darkpay.app` | `DarkPay@123` | Seller |

## Teste de login (deve funcionar)

1. Abra http://localhost:3000/login  
2. Entre com `igor@darkpay.app` / `DarkPay@123`  
3. Menu avatar → **Deslogar** → volta pro login  
4. **Integrações → Pagamentos** → criar venda (precisa chave PodPay no admin)

## PodPay (venda pendente real)

1. Login **admin**  
2. **Adquirentes → Credenciais → PodPay**  
3. Cole a **chave privada** `sk_test_…` e salve  
4. Logout → login **seller**  
5. **Integrações → Pagamentos** → **Criar venda pendente**

## Se ainda der “Não autenticado”

```bash
# recria banco + senhas
rm -f prisma/dev.db
npm run setup
npm run dev
```

Depois: **Deslogar** (se estiver “meio logado”) → login de novo.

## Produção com MySQL

1. Use `prisma/schema.mysql.prisma` + `darkpay.sql`  
2. `DATABASE_URL=mysql://...`  
3. `npm run db:seed`
