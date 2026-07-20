# DarkPay Backend — Go Specification

> Documento completo para recriação do backend DarkPay em Go.
> Baseado no código original Next.js + Prisma + TypeScript (~26k linhas).

---

## Índice

1. [Stack e Bibliotecas Go](#1-stack-e-bibliotecas-go)
2. [Estrutura de Diretórios](#2-estrutura-de-diretórios)
3. [Banco de Dados (MySQL)](#3-banco-de-dados-mysql)
4. [API Endpoints (58 rotas)](#4-api-endpoints)
5. [Autenticação e Autorização](#5-autenticação-e-autorização)
6. [Modelos e Tipos de Domínio](#6-modelos-e-tipos-de-domínio)
7. [Serviços de Negócio](#7-serviços-de-negócio)
8. [Integração com Adquirentes](#8-integração-com-adquirentes)
9. [Webhooks](#9-webhooks)
10. [Segurança](#10-segurança)
11. [Configuração / Env](#11-configuração--env)
12. [Middleware](#12-middleware)
13. [Healthcheck](#13-healthcheck)
14. [Upload de Arquivos](#14-upload-de-arquivos)

---

## 1. Stack e Bibliotecas Go

| Finalidade | Biblioteca | Versão (sugerida) |
|---|---|---|
| **HTTP Router** | `chi` (`github.com/go-chi/chi/v5`) | v5 |
| **Middleware CORS/Logger** | `chi` middlewares | embutido no chi |
| **Banco de Dados** | `pgx` (`github.com/jackc/pgx/v5`) | v5 |
| **Migration** | `golang-migrate/migrate` | v4 |
| **Validação** | `go-playground/validator/v10` | v10 |
| **Hash de senha** | `golang.org/x/crypto/bcrypt` | |
| **JWT / Token** | `golang-jwt/jwt/v5` | v5 |
| **TOTP / 2FA** | `pquerna/otp` | v1 |
| **QR Code** | `skip2/go-qrcode` | |
| **UUID** | `google/uuid` | v1 |
| **Log** | `rs/zerolog` | v1 |
| **HTTP Client** | `net/http` padrão + `go-resty/resty/v2` | v2 |
| **Task Queue** | `hibiken/asynq` | v1 |
| **Crypto** | `crypto/hmac`, `crypto/sha256`, `crypto/rand` (stdlib) | |
| **Config** | `spf13/viper` | v1 |
| **CSV/Export** | `gocarina/gocsv` | |
| **Testes** | `stretchr/testify` | v1 |
| **Mock DB** | `data-dog/go-sqlmock` | v1 |

---

## 2. Estrutura de Diretórios

```
backend/
├── cmd/
│   └── server/
│       └── main.go                 # Entrypoint
├── internal/
│   ├── config/
│   │   └── config.go               # Env/Config loader (viper)
│   ├── database/
│   │   ├── migrations/             # SQL migrations
│   │   ├── db.go                   # Conexão pgx pool
│   │   └── queries/                # Queries nomeadas (sqlc ou raw)
│   ├── auth/
│   │   ├── session.go              # Session CRUD
│   │   ├── password.go             # bcrypt hash/verify
│   │   ├── totp.go                 # TOTP setup/verify
│   │   ├── backup_codes.go         # Backup codes (bcrypt)
│   │   ├── api_key.go              # API key auth + hash
│   │   └── signed_token.go         # HMAC-signed tokens
│   ├── guards/
│   │   ├── require_auth.go         # requireAuth
│   │   ├── require_admin.go        # requireAdmin
│   │   ├── require_seller.go       # requireSellerAuth
│   │   ├── csrf.go                 # CSRF validation
│   │   └── require_permission.go   # requireStaffPermission
│   ├── handler/
│   │   ├── auth.go                 # login, register, me, logout, 2fa
│   │   ├── admin.go                # dashboard, users, managers, acquirers
│   │   ├── payments.go             # CRUD + sync + simulate
│   │   ├── transactions.go         # list transactions
│   │   ├── withdrawals.go          # list, create withdrawals
│   │   ├── finance.go              # finance snapshot
│   │   ├── dashboard.go            # seller dashboard
│   │   ├── api_credentials.go      # API key management
│   │   ├── branding.go             # branding CRUD
│   │   ├── documents.go            # document upload/review
│   │   ├── profile.go              # account/profile
│   │   ├── acquirers.go            # active, velana, podpay BFF
│   │   ├── webhooks.go             # velana + podpay webhooks
│   │   └── health.go               # healthcheck
│   ├── service/
│   │   ├── payment.go              # createPixCharge, markPaid, cancel
│   │   ├── withdrawal.go           # createWithdrawal, persist
│   │   ├── finance.go              # balance, ledger
│   │   ├── acquirer_resolver.go    # resolveAcquirerForSeller
│   │   └── webhook_processor.go    # apply podpay/velana webhooks
│   ├── acquirer/
│   │   ├── podpay/
│   │   │   ├── client.go           # HTTP client para API PodPay
│   │   │   ├── config.go           # config resolution
│   │   │   ├── gateway.go          # createCharge, createWithdrawal, sync
│   │   │   ├── mappers.go          # status maps, fee calc
│   │   │   └── types.go            # request/response types
│   │   ├── velana/
│   │   │   ├── client.go           # HTTP client para API Velana
│   │   │   ├── config.go           # config resolution
│   │   │   ├── gateway.go          # createCharge, createWithdrawal, sync
│   │   │   ├── mappers.go          # status maps, fee calc, document normalize
│   │   │   └── types.go            # request/response types
│   │   └── resolver.go             # resolveAcquirer + detectProvider
│   ├── middleware/
│   │   ├── auth.go                 # extract session/api-key
│   │   ├── csrf.go                 # CSRF validation middleware
│   │   ├── rate_limiter.go         # in-memory rate limit (melhorar: Redis)
│   │   ├── logger.go               # structured request log
│   │   ├── cors.go                 # CORS headers
│   │   ├── security_headers.go     # security headers
│   │   └── recovery.go             # panic recovery
│   ├── model/
│   │   ├── user.go
│   │   ├── session.go
│   │   ├── transaction.go
│   │   ├── withdrawal.go
│   │   ├── payment_charge.go
│   │   ├── acquirer.go
│   │   ├── manager.go
│   │   ├── document.go
│   │   ├── api_credential.go
│   │   ├── branding.go
│   │   ├── webhook.go
│   │   ├── balance_ledger.go
│   │   ├── metric_daily.go
│   │   └── notification.go
│   └── dto/
│       ├── request.go              # All request DTOs
│       └── response.go             # All response DTOs
├── pkg/
│   ├── security/
│   │   ├── headers.go              # securityHeaders()
│   │   ├── rate_limit.go           # Rate limiter logic
│   │   └── hmac.go                 # HMAC sign/verify + timingSafeCompare
│   ├── validator/
│   │   └── cpf_cnpj.go             # CPF/CNPJ validation
│   └── helpers/
│       ├── id.go                   # newId generators (crypto/rand)
│       ├── pagination.go           # page/pageSize helpers
│       └── response.go             # JSON response writers
├── scripts/
│   ├── seed.sql                    # Seed data
│   └── smoke.sh                    # Smoke tests
├── go.mod
├── go.sum
├── Dockerfile
├── Makefile
└── .env.example
```

---

## 3. Banco de Dados (MySQL)

> Usar MySQL 8.4 (utf8mb4). O SQLite usado em dev não precisa ser suportado em Go.
> Schema completo disponível em `darkpay.sql` e `prisma/schema.prisma`.

### 3.1 Tabelas (16)

#### `users`

| Coluna | Tipo | Restrições | Descrição |
|--------|------|-----------|-----------|
| id | VARCHAR(64) | PK | `usr_<crypto_random>` |
| name | VARCHAR(255) | NOT NULL | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | |
| password_hash | VARCHAR(255) | NULLABLE | bcrypt hash |
| phone | VARCHAR(20) | NULLABLE | |
| document | VARCHAR(20) | NULLABLE | CPF/CNPJ só dígitos |
| person_type | VARCHAR(4) | DEFAULT 'pf' | 'pf' ou 'pj' |
| status | VARCHAR(20) | DEFAULT 'pendente' | 'ativo'/'pendente'/'bloqueado' |
| roles | JSON | NOT NULL | `["seller"]`, `["admin","seller"]`, etc |
| avatar_url | TEXT | NULLABLE | |
| display_name | VARCHAR(255) | NULLABLE | |
| company | VARCHAR(255) | NULLABLE | |
| cnpj | VARCHAR(20) | NULLABLE | |
| address | TEXT | NULLABLE | |
| city | VARCHAR(100) | NULLABLE | |
| state | VARCHAR(50) | NULLABLE | |
| zip | VARCHAR(10) | NULLABLE | |
| balance_available | DECIMAL(15,2) | DEFAULT 0 | saldo disponível |
| balance_pending | DECIMAL(15,2) | DEFAULT 0 | saldo pendente |
| balance_held | DECIMAL(15,2) | DEFAULT 0 | saldo retido |
| volume_total | DECIMAL(15,2) | DEFAULT 0 | volume processado |
| platform_profit | DECIMAL(15,2) | DEFAULT 0 | lucro da plataforma |
| mdr_percent | DECIMAL(5,2) | DEFAULT 3 | taxa MDR % |
| mdr_fixed | DECIMAL(10,2) | DEFAULT 0.15 | taxa MDR fixa |
| saque_percent | DECIMAL(5,2) | DEFAULT 0 | taxa saque % |
| saque_fixed | DECIMAL(10,2) | DEFAULT 0 | taxa saque fixa |
| saque_automatico | TINYINT(1) | DEFAULT 0 | |
| routing_mode | VARCHAR(20) | DEFAULT 'plataforma' | 'plataforma'/'personalizado' |
| preferred_adquirente_id | VARCHAR(64) | NULLABLE | |
| manager_id | VARCHAR(64) | FK → managers.id, NULLABLE | |
| last_login_at | DATETIME | NULLABLE | |
| created_at | DATETIME | DEFAULT NOW() | |
| updated_at | DATETIME | ON UPDATE NOW() | |

Índices: `(status)`, `(created_at)`

#### `sessions`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| user_id | VARCHAR(64) | FK → users.id, ON DELETE CASCADE |
| token | VARCHAR(255) | UNIQUE, NOT NULL |
| expires_at | DATETIME | NOT NULL |
| ip | VARCHAR(45) | NULLABLE |
| user_agent | TEXT | NULLABLE |
| created_at | DATETIME | DEFAULT NOW() |

Índices: `(user_id)`

#### `password_resets`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| user_id | VARCHAR(64) | FK → users.id, CASCADE |
| email | VARCHAR(255) | NOT NULL |
| token | VARCHAR(255) | UNIQUE |
| code | VARCHAR(10) | NULLABLE |
| expires_at | DATETIME | NOT NULL |
| used_at | DATETIME | NULLABLE |
| created_at | DATETIME | DEFAULT NOW() |

Índices: `(user_id)`

#### `user_2fa`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| user_id | VARCHAR(64) | PK, FK → users.id, CASCADE |
| enabled | TINYINT(1) | DEFAULT 0 |
| secret | VARCHAR(255) | NULLABLE (TOTP secret) |
| backup_codes | JSON | NULLABLE (bcrypt hashes) |
| enabled_at | DATETIME | NULLABLE |
| updated_at | DATETIME | ON UPDATE NOW() |

#### `documents`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| user_id | VARCHAR(64) | FK → users.id, CASCADE |
| user_name | VARCHAR(255) | NOT NULL |
| user_email | VARCHAR(255) | NOT NULL |
| kind | VARCHAR(50) | NOT NULL ('selfie'/'doc_frente'/'doc_verso'/'contrato_social') |
| type_label | VARCHAR(50) | NOT NULL |
| submitted_at | DATETIME | DEFAULT NOW() |
| status | VARCHAR(20) | DEFAULT 'pendente' |
| preview_url | TEXT | NULLABLE |
| notes | TEXT | NULLABLE |
| reviewed_by | VARCHAR(64) | NULLABLE |
| reviewed_at | DATETIME | NULLABLE |

Índices: `(user_id)`, `(status)`

#### `acquirers`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| name | VARCHAR(100) | NOT NULL |
| code | VARCHAR(50) | UNIQUE ('VELANA'/'PODPAY') |
| status | VARCHAR(20) | DEFAULT 'ativo' |
| fee_percent | DECIMAL(5,2) | DEFAULT 0 |
| fee_fixed | DECIMAL(10,2) | DEFAULT 0 |
| volume_mes | DECIMAL(15,2) | DEFAULT 0 |
| transactions_mes | INT | DEFAULT 0 |
| settlement | VARCHAR(10) | DEFAULT 'D+0' |
| priority | INT | DEFAULT 99 |
| conversion_rate | DECIMAL(5,2) | DEFAULT 0 |
| public_key | TEXT | NULLABLE |
| private_key | TEXT | NULLABLE |
| env | VARCHAR(20) | DEFAULT 'sandbox' |
| enabled | TINYINT(1) | DEFAULT 1 |
| is_primary | TINYINT(1) | DEFAULT 0 |

Índices: `(status)`, `(priority)`

#### `user_acquirers`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| user_id | VARCHAR(64) | PK, FK → users.id, CASCADE |
| acquirer_id | VARCHAR(64) | PK, FK → acquirers.id, CASCADE |
| enabled | TINYINT(1) | DEFAULT 1 |
| created_at | DATETIME | DEFAULT NOW() |

#### `seller_custom_acquirers`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| user_id | VARCHAR(64) | FK → users.id, CASCADE |
| name | VARCHAR(100) | NOT NULL |
| fee_percent | DECIMAL(5,2) | DEFAULT 0 |
| fee_fixed | DECIMAL(10,2) | DEFAULT 0 |
| settlement | VARCHAR(10) | DEFAULT 'D+0' |
| enabled | TINYINT(1) | DEFAULT 1 |

Índices: `(user_id)`

#### `transactions`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| date | DATETIME | DEFAULT NOW() |
| seller_id | VARCHAR(64) | FK → users.id, CASCADE |
| seller_name | VARCHAR(255) | NULLABLE |
| kind | VARCHAR(20) | DEFAULT 'venda' ('venda'/'saque') |
| direction | VARCHAR(10) | DEFAULT 'entrada' ('entrada'/'saida') |
| description | TEXT | DEFAULT '' |
| method | VARCHAR(20) | DEFAULT 'PIX' |
| amount | DECIMAL(15,2) | NOT NULL |
| fee_amount | DECIMAL(15,2) | DEFAULT 0 |
| net_amount | DECIMAL(15,2) | DEFAULT 0 |
| platform_fee | DECIMAL(15,2) | DEFAULT 0 |
| status | VARCHAR(20) | DEFAULT 'pendente' ('pendente'/'aprovada'/'recusada'/'reembolsada'/'processando') |
| customer | VARCHAR(255) | NULLABLE |
| customer_email | VARCHAR(255) | NULLABLE |
| customer_document | VARCHAR(20) | NULLABLE |
| product | VARCHAR(255) | NULLABLE |
| acquirer_id | VARCHAR(64) | NULLABLE |
| provider | VARCHAR(20) | NULLABLE ('podpay'/'velana') |
| provider_id | VARCHAR(100) | NULLABLE |
| paid_at | DATETIME | NULLABLE |
| refunded_at | DATETIME | NULLABLE |

Índices: `(seller_id)`, `(status)`, `(date)`, `(provider_id)`, `(seller_id, date)`, `(seller_id, status)`, `(provider, provider_id)`

#### `withdrawals`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| date | DATETIME | DEFAULT NOW() |
| seller_id | VARCHAR(64) | FK → users.id, CASCADE |
| seller_name | VARCHAR(255) | NOT NULL |
| amount | DECIMAL(15,2) | NOT NULL |
| fee_percent | DECIMAL(5,2) | DEFAULT 0 |
| fee_fixed | DECIMAL(10,2) | DEFAULT 0 |
| fee_amount | DECIMAL(15,2) | DEFAULT 0 |
| net_amount | DECIMAL(15,2) | DEFAULT 0 |
| method | VARCHAR(20) | DEFAULT 'PIX' |
| destination | VARCHAR(255) | NOT NULL (chave PIX) |
| pix_key_type | VARCHAR(20) | NULLABLE |
| status | VARCHAR(20) | DEFAULT 'processando' ('processando'/'pago'/'recusado') |
| provider | VARCHAR(20) | NULLABLE |
| provider_id | VARCHAR(100) | NULLABLE |
| reviewed_by | VARCHAR(64) | NULLABLE |
| reviewed_at | DATETIME | NULLABLE |
| failure_reason | TEXT | NULLABLE |

Índices: `(seller_id)`, `(status)`, `(date)`, `(seller_id, status)`, `(provider_id)`

#### `payment_charges`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| seller_id | VARCHAR(64) | FK → users.id, CASCADE |
| amount | DECIMAL(15,2) | NOT NULL |
| currency | VARCHAR(5) | DEFAULT 'BRL' |
| status | VARCHAR(20) | DEFAULT 'waiting_payment' |
| method | VARCHAR(20) | DEFAULT 'PIX' |
| description | TEXT | NULLABLE |
| customer_name | VARCHAR(255) | NULLABLE |
| customer_document | VARCHAR(20) | NULLABLE |
| metadata | JSON | NULLABLE |
| pix_qr_code | TEXT | NULLABLE |
| pix_copy_paste | TEXT | NULLABLE |
| expires_at | DATETIME | NOT NULL |
| paid_at | DATETIME | NULLABLE |
| transaction_id | VARCHAR(64) | NULLABLE |
| provider | VARCHAR(20) | NULLABLE |
| provider_id | VARCHAR(100) | NULLABLE |

Índices: `(seller_id)`, `(status)`, `(provider_id)`, `(transaction_id)`, `(seller_id, status)`

#### `balance_ledger`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| user_id | VARCHAR(64) | FK → users.id, CASCADE |
| type | VARCHAR(50) | NOT NULL |
| amount | DECIMAL(15,2) | NOT NULL |
| bucket | VARCHAR(20) | NOT NULL ('available'/'pending'/'held') |
| balance_after | DECIMAL(15,2) | NULLABLE |
| reference_type | VARCHAR(50) | NULLABLE |
| reference_id | VARCHAR(64) | NULLABLE |
| description | TEXT | NULLABLE |
| created_at | DATETIME | DEFAULT NOW() |

Índices: `(user_id)`, `(created_at)`

#### `metric_daily`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | BIGINT | PK AUTO_INCREMENT |
| scope | VARCHAR(50) | NOT NULL ('platform'/'seller') |
| user_id | VARCHAR(64) | NULLABLE |
| date | DATE | NOT NULL |
| volume_gross | DECIMAL(15,2) | DEFAULT 0 |
| volume_net | DECIMAL(15,2) | DEFAULT 0 |
| platform_revenue | DECIMAL(15,2) | DEFAULT 0 |
| seller_profit | DECIMAL(15,2) | DEFAULT 0 |
| tx_count | INT | DEFAULT 0 |
| tx_paid | INT | DEFAULT 0 |
| tx_pending | INT | DEFAULT 0 |
| tx_failed | INT | DEFAULT 0 |
| tx_refunded | INT | DEFAULT 0 |
| average_ticket | DECIMAL(15,2) | DEFAULT 0 |
| conversion_rate | DECIMAL(5,2) | DEFAULT 0 |
| outflow_total | DECIMAL(15,2) | DEFAULT 0 |
| withdrawal_count | INT | DEFAULT 0 |
| withdrawal_paid | DECIMAL(15,2) | DEFAULT 0 |
| withdrawal_pending | DECIMAL(15,2) | DEFAULT 0 |
| withdrawal_fees | DECIMAL(15,2) | DEFAULT 0 |
| held_balance_eod | DECIMAL(15,2) | DEFAULT 0 |

UNIQUE: `(scope, user_id, date)`. Índice: `(date)`

#### `platform_fee_plans`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| name | VARCHAR(100) | NOT NULL |
| method | VARCHAR(20) | DEFAULT 'PIX' |
| settlement | VARCHAR(10) | DEFAULT 'D+0' |
| mdr_percent | DECIMAL(5,2) | DEFAULT 3 |
| mdr_fixed | DECIMAL(10,2) | DEFAULT 0.15 |
| reserve_days | INT | DEFAULT 0 |
| description | TEXT | NULLABLE |
| active | TINYINT(1) | DEFAULT 1 |
| sort_order | INT | DEFAULT 0 |

#### `managers`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| name | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | UNIQUE |
| phone | VARCHAR(20) | NULLABLE |
| document | VARCHAR(20) | NULLABLE |
| status | VARCHAR(20) | DEFAULT 'ativo' |
| permissions | JSON | NOT NULL |
| sellers_count | INT | DEFAULT 0 |
| volume_total | DECIMAL(15,2) | DEFAULT 0 |
| origin_user_id | VARCHAR(64) | NULLABLE |

#### `branding`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK DEFAULT 'default' |
| logo_url | TEXT | NOT NULL |
| favicon_url | TEXT | NOT NULL |
| auth_image_url | TEXT | NOT NULL |

#### `brand_banners`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| image_url | TEXT | NOT NULL |
| name | VARCHAR(255) | DEFAULT '' |
| link_url | VARCHAR(500) | DEFAULT '' |
| sort_order | INT | DEFAULT 0 |
| active | TINYINT(1) | DEFAULT 1 |

Índice: `(sort_order)`

#### `api_credentials`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| user_id | VARCHAR(64) | FK → users.id, CASCADE |
| name | VARCHAR(100) | DEFAULT 'API Integração' |
| public_key | VARCHAR(100) | UNIQUE |
| secret_key_hash | VARCHAR(64) | NOT NULL (SHA-256 do secret) |
| secret_key_hint | VARCHAR(20) | NULLABLE ('sk_...xxxx') |
| permissions | JSON | NOT NULL |
| active | TINYINT(1) | DEFAULT 1 |
| last_used_at | DATETIME | NULLABLE |

Índices: `(user_id)`

#### `webhook_endpoints`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| user_id | VARCHAR(64) | FK → users.id, CASCADE |
| url | TEXT | NOT NULL |
| secret | TEXT | NULLABLE |
| events | JSON | NOT NULL |
| active | TINYINT(1) | DEFAULT 1 |

Índices: `(user_id)`

#### `webhook_deliveries`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| endpoint_id | VARCHAR(64) | FK → webhook_endpoints.id, CASCADE |
| event | VARCHAR(100) | NOT NULL |
| payload | JSON | NOT NULL |
| status_code | INT | NULLABLE |
| success | TINYINT(1) | DEFAULT 0 |
| attempts | INT | DEFAULT 0 |
| last_error | TEXT | NULLABLE |
| delivered_at | DATETIME | NULLABLE |

#### `integration_utmify`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| user_id | VARCHAR(64) | UNIQUE, FK → users.id, CASCADE |
| api_token | TEXT | NULLABLE |
| active | TINYINT(1) | DEFAULT 0 |
| settings | JSON | NULLABLE |

#### `notification_settings`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| user_id | VARCHAR(64) | PK, FK → users.id, CASCADE |
| sale_toast_enabled | TINYINT(1) | DEFAULT 1 |
| sale_sound_enabled | TINYINT(1) | DEFAULT 1 |
| email_on_sale | TINYINT(1) | DEFAULT 0 |
| email_on_withdrawal | TINYINT(1) | DEFAULT 1 |
| email_on_doc_review | TINYINT(1) | DEFAULT 1 |

#### `sale_notifications`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| user_id | VARCHAR(64) | FK → users.id, CASCADE |
| transaction_id | VARCHAR(64) | NULLABLE |
| title | VARCHAR(255) | NOT NULL |
| body | TEXT | NULLABLE |
| amount | DECIMAL(15,2) | NULLABLE |
| read_at | DATETIME | NULLABLE |

Índices: `(user_id)`

#### `audit_logs`

| Coluna | Tipo | Restrições |
|--------|------|-----------|
| id | VARCHAR(64) | PK |
| actor_id | VARCHAR(64) | NULLABLE |
| actor_email | VARCHAR(255) | NULLABLE |
| action | VARCHAR(100) | NOT NULL |
| entity_type | VARCHAR(50) | NULLABLE |
| entity_id | VARCHAR(64) | NULLABLE |
| meta | JSON | NULLABLE |
| ip | VARCHAR(45) | NULLABLE |

Índices: `(actor_id)`, `(action)`, `(created_at)`

### 3.2 Regras de Seed

```sql
-- password: DarkPay@123 (bcrypt hash com 10 rounds)
INSERT INTO users (id, name, email, password_hash, status, roles, person_type)
VALUES
  ('usr_admin', 'Admin DarkPay', 'admin@darkpay.app', '<hash>', 'ativo', '["admin","seller"]', 'pj'),
  ('usr_01', 'Igor Rocha', 'igor@darkpay.app', '<hash>', 'ativo', '["seller"]', 'pf');

INSERT INTO user_2fa (user_id, enabled) VALUES ('usr_admin', 0), ('usr_01', 0);
INSERT INTO notification_settings (user_id) VALUES ('usr_admin'), ('usr_01');

INSERT INTO acquirers (id, name, code, status, priority, is_primary, enabled, env, fee_percent, fee_fixed, settlement)
VALUES
  ('velana', 'Velana', 'VELANA', 'ativo', 1, 1, 1, 'live', 0, 0.8, 'D+0'),
  ('podpay', 'PodPay', 'PODPAY', 'ativo', 2, 0, 1, 'sandbox', 1.49, 0.15, 'D+0');

INSERT INTO branding (id, logo_url, favicon_url, auth_image_url)
VALUES ('default', '/logo-darkpay-header.png', '/logo-darkpay-clean.jpg', '/banner-darkpay.jpg');
```

---

## 4. API Endpoints

### 4.1 Healthcheck

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/health` | Pública | Healthcheck + posture de segurança |

### 4.2 Auth (6 rotas)

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/api/v1/auth/login` | Pública (rate-limited) | Login com email+senha |
| POST | `/api/v1/auth/register` | Pública | Registro de seller |
| GET | `/api/v1/auth/me` | Session | Dados do usuário logado |
| POST | `/api/v1/auth/logout` | Session | Logout + limpa cookie |
| POST | `/api/v1/auth/login/2fa` | Pública (challenge) | Segundo fator TOTP |
| GET/POST | `/api/v1/auth/2fa` | `requireAuth` | Setup/gerenciamento 2FA |

### 4.3 Admin (12 rotas)

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/v1/admin/dashboard` | `requireAdmin` | Dashboard admin |
| GET | `/api/v1/admin/metrics` | `requireAdmin` | Métricas agregadas |
| GET | `/api/v1/admin/users` | `requireAdmin` | Lista de usuários |
| GET/PATCH | `/api/v1/admin/users/:id` | `requireAdmin` | Detalhe/atualização de usuário |
| GET/POST | `/api/v1/admin/managers` | `requireStaffPermission("gerentes")` | CRUD gerentes |
| PATCH | `/api/v1/admin/managers/:id` | `requireStaffPermission("gerentes")` | Atualizar gerente |
| GET | `/api/v1/admin/sellers` | `requireAdmin` | Lista sellers (DB) |
| GET | `/api/v1/admin/saques` | `requireAdmin` | Saques pendentes |
| GET | `/api/v1/admin/withdrawals` | `requireAdmin` | Lista saques |
| PATCH | `/api/v1/admin/withdrawals/:id` | `requireAdmin` | Aprovar/recusar saque |
| GET | `/api/v1/admin/acquirers` | `requireAdmin` | Lista adquirentes |
| GET/PATCH | `/api/v1/admin/acquirers/:id` | `requireAdmin` | Detalhe/config adquirente |

### 4.4 Payments (5 rotas)

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET/POST | `/api/v1/payments` | `requireSellerAuth("transacoes")` | Criar/listar cobranças |
| GET | `/api/v1/payments/:id` | `requireSellerAuth("transacoes")` | Detalhe cobrança |
| POST/GET | `/api/v1/payments/:id/sync` | `requireSellerAuth("transacoes")` | Sincronizar status |
| POST | `/api/v1/payments/:id/simulate-pay` | `requireAuth` | Simular pagamento (mock) |

### 4.5 Finance/Transactions/Withdrawals (3 rotas)

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/v1/finance` | `requireAuth` | Snapshot financeiro |
| GET | `/api/v1/transactions` | `requireAuth` | Lista transações |
| GET/POST | `/api/v1/withdrawals` | `requireAuth` | Listar/criar saques |

### 4.6 Dashboard (1 rota)

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/v1/dashboard` | `requireAuth` | Dashboard seller |

### 4.7 API Credentials (2 rotas)

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET/POST | `/api/v1/api-credentials` | `requireAuth` | Listar/criar credenciais |
| PATCH/POST/DELETE | `/api/v1/api-credentials/:id` | `requireAuth` | Atualizar/rotacionar/deletar |

### 4.8 Branding (1 rota)

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET/PUT | `/api/v1/branding` | GET: pública, PUT: staff | Configuração de branding |

### 4.9 Acquirers BFF (19 rotas)

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/api/v1/acquirers/active` | `requireAuth` | Adquirente ativa do seller |
| GET | `/api/v1/acquirers/velana/status` | `requireAdmin` | Status conexão Velana |
| GET | `/api/v1/acquirers/velana/balance` | `requireAdmin` | Saldo Velana |
| GET/POST | `/api/v1/acquirers/velana/transactions` | `requireAdmin` | Transações Velana |
| GET | `/api/v1/acquirers/velana/transactions/:id` | `requireAdmin` | Detalhe transação Velana |
| POST | `/api/v1/acquirers/velana/transactions/:id/refund` | `requireAdmin` | Reembolso Velana |
| POST | `/api/v1/acquirers/velana/transfers` | `requireAdmin` | Transferência Velana |
| GET | `/api/v1/acquirers/velana/transfers/:id` | `requireAdmin` | Detalhe transferência Velana |
| GET | `/api/v1/acquirers/velana/company` | `requireAdmin` | Dados empresa Velana |
| POST | `/api/v1/acquirers/velana/checkouts` | `requireAdmin` | Checkout Velana |
| GET | `/api/v1/acquirers/podpay/status` | `requireAdmin` | Status PodPay |
| GET | `/api/v1/acquirers/podpay/balance` | `requireAdmin` | Saldo PodPay |
| GET/POST | `/api/v1/acquirers/podpay/transactions` | `requireAdmin` | Transações PodPay |
| GET | `/api/v1/acquirers/podpay/transactions/:id` | `requireAdmin` | Detalhe transação |
| POST | `/api/v1/acquirers/podpay/transactions/:id/refund` | `requireAdmin` | Reembolso PodPay |
| GET/POST | `/api/v1/acquirers/podpay/withdrawals` | `requireAdmin` | Saques PodPay |
| GET | `/api/v1/acquirers/podpay/withdrawals/:id` | `requireAdmin` | Detalhe saque |
| PATCH | `/api/v1/acquirers/podpay/withdrawals/:id/cancel` | `requireAdmin` | Cancelar saque |
| POST | `/api/v1/acquirers/podpay/checkout/sessions` | `requireAdmin` | Sessão checkout PodPay |
| GET | `/api/v1/acquirers/podpay/checkout/sessions/:token` | `requireAdmin` | Dados sessão PodPay |
| POST | `/api/v1/acquirers/podpay/checkout/sessions/:token/coupon` | `requireAdmin` | Aplicar cupom PodPay |
| POST | `/api/v1/acquirers/podpay/checkout/sessions/:token/pay` | `requireAdmin` | Pagar sessão PodPay |
| POST | `/api/v1/acquirers/podpay/checkout/payment-links/:publicToken/sessions` | `requireAdmin` | Abrir sessão de link |

### 4.10 Webhooks (2 rotas)

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| POST/GET | `/api/v1/webhooks/podpay` | Pública (HMAC) | Webhook PodPay |
| POST/GET | `/api/v1/webhooks/velana` | Pública (HMAC) | Webhook Velana |

### 4.11 Profile (1 rota)

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET/PATCH | `/api/v1/account/profile` | `requireAuth` | Perfil do usuário |

### 4.12 Documents (1 rota)

| Método | Path | Auth | Descrição |
|--------|------|------|-----------|
| GET/POST | `/api/v1/documents` | `requireAuth` | Upload/lista documentos |

---

## 5. Autenticação e Autorização

### 5.1 Fluxo de Login

```
POST /api/v1/auth/login
Body: { email: string, password: string }

1. Validar com Zod (email formato, password não vazia)
2. Rate limit: max 10 tentativas/15min por IP+email (substituir Redis)
3. Buscar user por email no DB
4. Verificar bcrypt hash
5. Se user está bloqueado → 403
6. Verificar se user tem 2FA:
   - Se sim → responder { requires2fa: true, challenge: <signed_token> }
7. Criar session: token = crypto/rand 32 bytes → HMAC-sign → cookie
8. Salvar session no DB (7 dias de expiração)
9. Retornar { user, expiresAt }
```

### 5.2 2FA Flow

```
1. GET /api/v1/auth/2fa (autenticado) → { enabled, secret?, otpauthUrl? }
2. POST /api/v1/auth/2fa { action: "enable", token } → { enabled, backupCodes }
3. POST /api/v1/auth/2fa { action: "disable", token } → { enabled: false }
4. POST /api/v1/auth/login/2fa { challenge, token } → { user, expiresAt }
```

Implementação TOTP:
- Gerar secret com `otplib.authenticator.generateSecret()` (20 bytes base32)
- `otpauth://totp/DarkPay:{email}?secret={secret}&issuer=DarkPay`
- Verificar com `otplib.authenticator.verify({ token, secret })`
- Backup codes: 8 códigos de 8 chars, bcrypt hash, consumidos com `bcrypt.Compare`

### 5.3 Session Cookie

Formato: `HMAC-SHA256(base64url(rawToken|expUnix))` + `.` + `base64url(signature)`

```
rawToken = crypto/rand 32 bytes → hex
expUnix = time.Now().Add(7*24*time.Hour).Unix()
payload = base64url(rawToken + "|" + strconv.FormatInt(expUnix, 10))
sig = HMAC-SHA256(payload, SESSION_SECRET)
cookie = payload + "." + base64url(sig)
```

### 5.4 API Key Auth

Formato: `sk_live_<64hex>` ou `sk_test_<64hex>`

- Hash: SHA-256 do secret (armazenar no DB como `secret_key_hash`)
- Header: `Authorization: Bearer sk_live_...`
- Validação: hash → lookup → check active, not expired, permissions
- Rate limit: por API key (sugestão: 100 req/min)

### 5.5 Guard Hierarchy

```
requireAuth
├── requireAdmin (admin role + 2FA check)
│   └── requireStaffPermission (manager permission check)
└── requireSellerAuth (seller role + account status)
    └── requireSellerAuth("transacoes") (specific API permission)
```

### 5.6 Guard Implementation (Go middleware pattern)

```go
type GuardOk struct {
    User    *model.User
    AuthVia string // "session" | "api_key"
}

func (g *GuardOk) IsAdmin() bool {
    return hasRole(g.User.Roles, "admin")
}

func (g *GuardOk) IsStaff() bool {
    return hasRole(g.User.Roles, "admin") || hasRole(g.User.Roles, "manager")
}
```

---

## 6. Modelos e Tipos de Domínio

```go
type Role string
const (
    RoleSeller  Role = "seller"
    RoleAdmin   Role = "admin"
    RoleManager Role = "manager"
)

type UserStatus string
const (
    UserStatusAtivo    UserStatus = "ativo"
    UserStatusPendente UserStatus = "pendente"
    UserStatusBloqueado UserStatus = "bloqueado"
)

type VendaStatus string
const (
    VendaPendente   VendaStatus = "pendente"
    VendaAprovada   VendaStatus = "aprovada"
    VendaRecusada   VendaStatus = "recusada"
    VendaReembolsada VendaStatus = "reembolsada"
)

type SaqueStatus string
const (
    SaqueProcessando SaqueStatus = "processando"
    SaquePago        SaqueStatus = "pago"
    SaqueRecusado    SaqueStatus = "recusado"
)

type AuthUser struct {
    ID              string      `json:"id"`
    Name            string      `json:"name"`
    Email           string      `json:"email"`
    Status          UserStatus  `json:"status"`
    Roles           []Role      `json:"roles"`
    AvatarURL       *string     `json:"avatarUrl"`
    DisplayName     *string     `json:"displayName"`
    TwoFactorEnabled bool      `json:"twoFactorEnabled"`
    MustSetup2fa    bool        `json:"mustSetup2fa"`
    Kyc             *AuthKyc    `json:"kyc,omitempty"`
    Permissions     []string    `json:"permissions,omitempty"`
}

type Transaction struct {
    ID              string      `json:"id"`
    Date            time.Time   `json:"date"`
    SellerID        string      `json:"sellerId"`
    SellerName      string      `json:"sellerName"`
    Kind            string      `json:"kind"`       // "venda" | "saque"
    Direction       string      `json:"direction"`  // "entrada" | "saida"
    Description     string      `json:"description"`
    Method          string      `json:"method"`     // "PIX"
    Amount          float64     `json:"amount"`
    FeeAmount       float64     `json:"feeAmount"`
    NetAmount       float64     `json:"netAmount"`
    PlatformFee     float64     `json:"platformFee"`
    Status          string      `json:"status"`
    Customer        *string     `json:"customer"`
    CustomerEmail   *string     `json:"customerEmail"`
    CustomerDocument *string    `json:"customerDocument"`
    Product         *string     `json:"product"`
    AcquirerID      *string     `json:"acquirerId"`
    Provider        *string     `json:"provider"`
    ProviderID      *string     `json:"providerId"`
    PaidAt          *time.Time  `json:"paidAt"`
    RefundedAt      *time.Time  `json:"refundedAt"`
    CreatedAt       time.Time   `json:"createdAt"`
}

type Withdrawal struct {
    ID          string    `json:"id"`
    Date        time.Time `json:"date"`
    SellerID    string    `json:"sellerId"`
    SellerName  string    `json:"sellerName"`
    Amount      float64   `json:"amount"`
    FeePercent  float64   `json:"feePercent"`
    FeeFixed    float64   `json:"feeFixed"`
    FeeAmount   float64   `json:"feeAmount"`
    NetAmount   float64   `json:"netAmount"`
    Method      string    `json:"method"`     // "PIX"
    Destination string    `json:"destination"`
    PixKeyType  *string   `json:"pixKeyType"`
    Status      SaqueStatus `json:"status"`
    Provider    *string   `json:"provider"`
    ProviderID  *string   `json:"providerId"`
    ReviewBy    *string   `json:"reviewedBy"`
    ReviewAt    *time.Time `json:"reviewedAt"`
    FailReason  *string   `json:"failureReason"`
    CreatedAt   time.Time `json:"createdAt"`
}

type PaymentCharge struct {
    ID              string     `json:"id"`
    SellerID        string     `json:"sellerId"`
    Amount          float64    `json:"amount"`
    Currency        string     `json:"currency"`
    Status          string     `json:"status"` // "waiting_payment" | "paid" | "cancelled" | "refunded"
    Method          string     `json:"method"`
    Description     *string    `json:"description"`
    CustomerName    *string    `json:"customerName"`
    CustomerDocument *string   `json:"customerDocument"`
    PixQrCode       *string    `json:"pixQrCode"`
    PixCopyPaste    *string    `json:"pixCopyPaste"`
    ExpiresAt       time.Time  `json:"expiresAt"`
    PaidAt          *time.Time `json:"paidAt"`
    TransactionID   *string    `json:"transactionId"`
    Provider        *string    `json:"provider"`
    ProviderID      *string    `json:"providerId"`
    CreatedAt       time.Time  `json:"createdAt"`
}

type Balances struct {
    Available float64 `json:"available"`
    Pending   float64 `json:"pending"`
    Held      float64 `json:"held"`
}
```

---

## 7. Serviços de Negócio

### 7.1 Criação de Cobrança PIX

```
createPixCharge(input):
  1. Validar sellerId, amount >= 1
  2. Verificar status seller: se "bloqueado" → erro
  3. Resolver adquirente ativa: resolveAcquirerForSeller(sellerId)
  4. Rotear:
     a) PodPay: createChargeViaPodPay(input)
     b) Velana: createChargeViaVelana(input)
     c) Mock (ALLOW_MOCK_DATA=1): createPixChargeMock(input)
  5. Se falhar todas: erro "Adquirente não configurada"
```

### 7.2 Marcação de Cobrança Paga (Idempotente)

```
creditPaidSaleIdempotent(sellerId, amount, fee):
  1. UPDATE transactions SET status='aprovada', paid_at=NOW()
     WHERE id=? AND status='pendente'
  2. Se affected=0 → retorna { credited: false } (já processado)
  3. UPDATE payment_charges SET status='paid' WHERE provider_id=? AND status='waiting_payment'
  4. net = max(0, amount - fee)
  5. UPDATE users SET
       balance_pending = balance_pending - amount,
       balance_available = balance_available + net,
       volume_total = volume_total + amount
     WHERE id = sellerId
```

IMPORTANTE: Usar transação DB para steps 1-5. A idempotência é garantida pelo step 1 (`status='pendente'`).

### 7.3 Criação de Saque

```
createWithdrawal(sellerId, sellerName, input):
  1. Validar amount >= 5, pixKey não vazio
  2. Carregar taxas do seller (saquePercent, saqueFixed)
  3. Calcular feeAmount = round((amount * feePercent / 100) + feeFixed)
  4. Verificar feeAmount < amount
  5. Debitar saldo atômico:
     UPDATE users SET balance_available = balance_available - amount
     WHERE id=? AND balance_available >= amount
  6. Se affected=0 → erro "saldo insuficiente"
  7. Resolver adquirente → criar saque remoto
  8. Se falhar → ROLLBACK (devolver saldo)
  9. Persistir withdrawal no DB
```

### 7.4 Aprovação/Recusa de Saque (Admin)

```
dbSetWithdrawalStatus(id, status):
  IN TRANSACTION:
    1. UPDATE withdrawals SET status=?, reviewed_at=NOW() WHERE id=?
    2. Se status='recusado':
       UPDATE users SET balance_available += amount WHERE id=sellerId
       INSERT INTO balance_ledger (...)
    3. Se status='pago' AND fee>0:
       UPDATE users SET platform_profit += fee WHERE id=sellerId
    4. INSERT INTO transactions (...) (kind='saque', direction='saida')
```

### 7.5 Cálculo de Taxas

**PodPay (fixo):**
- MDR: 3% + R$ 0.15 por transação
- Saque: sem taxa percentual, só o que PodPay cobrar

**Velana (configurável):**
- Custo plataforma: R$ 0.80/TX
- Taxa seller padrão: 2.99% + R$ 1.00
- Mínimo: R$ 1.00 (cobre custo + margem)
- Fórmula: `max(amount * (percent/100) + fixed, 0.80 + 0.20)`

### 7.6 Dashboard Seller

```
getSellerDashboard(sellerId, period):
  1. SELECT user balance fields
  2. Aggregate transactions WHERE seller_id=? AND kind='venda'
     - SUM(amount) WHERE status='aprovada' AND date >= period
     - COUNT(*) WHERE status='aprovada'
     - COUNT(*) WHERE status IN ('aprovada','recusada','reembolsada')
  3. Aggregate withdrawals: SUM(amount) WHERE status='pago' AND date >= period
  4. Build volume history (daily aggregation)
  5. Calcular: conversionRate, averageTicket, volumeGoal
```

---

## 8. Integração com Adquirentes

### 8.1 Acquirer Resolver

```
resolveAcquirerForSeller(sellerId):
  1. Buscar seller: routingMode, preferredAdquirenteId
  2. Se routingMode='personalizado' AND preferredAdquirenteId:
     Usar adquirente específica do seller
  3. Senão: buscar #1 da fila (DB acquirers ORDER BY priority ASC)
  4. Se #1 não tem chave → tentar próxima
  5. Se nenhuma no DB → tentar env vars
  6. Retornar { provider, id, hasKey }
```

### 8.2 Celery/Velana API

**Base URL:** `https://api.velana.com.br/v1`

**Auth:** `Authorization: Basic base64("secretKey:x")`

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/transactions` | POST | Criar transação PIX |
| `/transactions` | GET | Listar transações |
| `/transactions/:id` | GET | Detalhe transação |
| `/transactions/:id/refund` | POST | Reembolsar |
| `/transfers` | POST | Criar transferência PIX |
| `/transfers/:id` | GET | Detalhe transferência |
| `/balance/available` | GET | Saldo disponível |
| `/company` | GET | Dados da empresa |
| `/checkouts` | POST | Criar checkout |

**Request Criação PIX (Velana):**
```json
{
  "amount": 10000,
  "paymentMethod": "pix",
  "customer": {
    "name": "Cliente",
    "email": "cliente@email.com",
    "phone": "11999999999",
    "document": { "type": "cpf", "number": "52998224725" }
  },
  "items": [{
    "title": "Pagamento",
    "unitPrice": 10000,
    "quantity": 1,
    "tangible": false
  }],
  "pix": { "expiresInDays": 1 },
  "metadata": "ref=ext|seller=usr_01",
  "postbackUrl": "https://.../api/v1/webhooks/velana"
}
```

**Response Criação PIX:**
```json
{
  "id": 12345,
  "amount": 10000,
  "status": "waiting_payment",
  "pix": {
    "qrcode": "000201265...",
    "url": "https://api.velana.com.br/v1/pix/qr/abc123",
    "expirationDate": "2026-07-21"
  },
  "createdAt": "2026-07-20T01:00:00Z"
}
```

### 8.3 PodPay API

**Base URL:** `https://api.podpay.app` (sandbox: `https://sandbox.podpay.app`)

**Auth:** `x-api-key: sk_live_<64hex>`

| Endpoint | Método | Propósito |
|----------|--------|-----------|
| `/v1/transactions` | POST | Criar cobrança |
| `/v1/transactions` | GET | Listar transações |
| `/v1/transactions/:id` | GET | Detalhe transação |
| `/v1/transactions/:id/refund` | POST | Reembolsar |
| `/v1/withdrawals` | POST | Criar saque |
| `/v1/withdrawals` | GET | Listar saques |
| `/v1/withdrawals/:id` | GET | Detalhe saque |
| `/v1/withdrawals/:id/cancel` | PATCH | Cancelar saque |
| `/v1/balance/available` | GET | Saldo |
| `/v1/checkout/sessions` | POST | Criar sessão checkout |
| `/v1/checkout/sessions/:token` | GET | Dados sessão |
| `/v1/checkout/sessions/:token/coupon` | POST | Aplicar cupom |
| `/v1/checkout/sessions/:token/pay` | POST | Pagar sessão |
| `/v1/checkout/payment-links/:publicToken/sessions` | POST | Sessão de link |

**Request criação PIX (PodPay):**
```json
{
  "paymentMethod": "pix",
  "amount": 10000,
  "customer": {
    "name": "Cliente",
    "email": "cliente@email.com",
    "phone": "11999999999",
    "document": { "type": "cpf", "number": "52998224725" }
  },
  "items": [{
    "title": "Pagamento",
    "unitPrice": 10000,
    "quantity": 1,
    "tangible": false
  }]
}
```

**Envelope PodPay (todas respostas):**
```json
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "req_..." }
}
```

---

## 9. Webhooks

### 9.1 Velana Webhook

**Endpoint:** `POST /api/v1/webhooks/velana`

**Payload:**
```json
{
  "id": 123,
  "type": "transaction",
  "objectId": "67890",
  "data": {
    "id": "67890",
    "status": "paid",
    "amount": 10000
  }
}
```

**HMAC:** `x-velana-signature` ou `x-signature` header. Gerar com `HMAC-SHA256(body, VELANA_WEBHOOK_SECRET)`.

**Processamento:**
```
1. Verificar HMAC (se VELANA_WEBHOOK_SECRET configurado)
2. Parsear payload
3. Se type='transaction':
   - Buscar payment_charge por providerId
   - Atualizar status conforme mapped (pending → paid/refunded/cancelled)
   - Ajustar saldos (pending → available) com creditPaidSaleIdempotent
4. Se type='transfer':
   - Buscar withdrawal por providerId
   - Atualizar status (processing → done/failed)
   - Se falhou: devolver saldo
```

### 9.2 PodPay Webhook

**Endpoint:** `POST /api/v1/webhooks/podpay`

**Payload:**
```json
{
  "event": "transaction.completed",
  "data": { "id": "tx_123", "status": "PAID", "amount": 10000 },
  "signature": "...",
  "eventId": "evt_..."
}
```

**HMAC:** `x-signature` header. Gerar com `HMAC-SHA256(body, PODPAY_WEBHOOK_SECRET)`.

**Processamento:**
- Mesma lógica da Velana, adaptando status mapping

### 9.3 Task Queue (Recomendação)

Usar **Asynq** (Redis-based) para processamento assíncrono:

```
Enqueue: webhook_received → process_webhook
Worker: process_webhook → apply_to_db
Retry: 3 tentativas com backoff exponencial
```

---

## 10. Segurança

### 10.1 Rate Limiting

| Recurso | Limite | Janela | Estratégia |
|---------|--------|--------|------------|
| Login | 10 tentativas | 15 min | IP + email |
| Register | 3 tentativas | 15 min | IP |
| API Key | 100 req | 1 min | Por chave |
| Geral | 1000 req | 1 min | IP |

> **Recomendação Go:** Usar Redis com `github.com/go-redis/redis_rate/v9` para rate limit compartilhado entre instâncias.

### 10.2 CSRF

- Verificar `Origin` ou `Referer` header em mutações (POST/PUT/PATCH/DELETE)
- Em produção: bloquear se Origin não corresponde ao domínio
- Em dev: permitir `CSRF_ALLOW_MISSING_ORIGIN=1`
- Permitir localhost ↔ 127.0.0.1 em dev

### 10.3 Security Headers

```go
func SecurityHeaders() http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("X-Content-Type-Options", "nosniff")
        w.Header().Set("X-Frame-Options", "DENY")
        w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
        w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        w.Header().Set("X-DNS-Prefetch-Control", "off")
        if isProduction {
            w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
        }
        next.ServeHTTP(w, r)
    })
}
```

### 10.4 Password Policy

- Mínimo 10 caracteres
- Deve conter letras e números
- Armazenar com bcrypt (cost=10)

### 10.5 SESSION_SECRET

- Mínimo 32 bytes (gerar: `openssl rand -hex 32`)
- **NUNCA** ter fallback hardcoded em produção. Falhar com erro se não configurado.

### 10.6 Validação CPF/CNPJ

```go
func ValidateCPF(cpf string) bool  // dígitos verificadores
func ValidateCNPJ(cnpj string) bool // dígitos verificadores
```

---

## 11. Configuração / Env

```
# Banco
DATABASE_URL=mysql://user:senha@host:3306/darkpay

# Sessão
SESSION_SECRET=<openssl rand -hex 32>
COOKIE_SECURE=0        # 1 em produção com HTTPS
FORCE_INSECURE_COOKIE=0

# PodPay
PODPAY_API_KEY=
PODPAY_ENV=sandbox
PODPAY_WEBHOOK_SECRET=
PODPAY_POSTBACK_BASE_URL=
PODPAY_BASE_URL=

# Velana
VELANA_SECRET_KEY=
VELANA_PUBLIC_KEY=
VELANA_ENV=sandbox
VELANA_WEBHOOK_SECRET=
VELANA_POSTBACK_BASE_URL=
VELANA_BASE_URL=
VELANA_ALLOW_UNSIGNED_WEBHOOK=0

# Email
RESEND_API_KEY=
EMAIL_FROM=DarkPay <noreply@seudominio.com>

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
ALLOW_MOCK_DATA=0
LOG_LEVEL=info

# Admin 2FA
REQUIRE_ADMIN_2FA=0     # 1 força 2FA para admin

# Redis (para fila e rate limit)
REDIS_URL=redis://localhost:6379
```

---

## 12. Middleware (Edge)

Em Go, o middleware substitui a lógica do `middleware.ts` do Next.js:

```go
func AuthRedirectMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        path := r.URL.Path

        // API routes: passa para handlers internos
        if strings.HasPrefix(path, "/api/") {
            next.ServeHTTP(w, r)
            return
        }

        // Public paths
        publicPaths := []string{"/login", "/registro", "/esqueci-senha", "/redefinir-senha", "/docs"}
        isPublic := false
        for _, p := range publicPaths {
            if strings.HasPrefix(path, p) || strings.HasPrefix(path, "/_next") || strings.HasPrefix(path, "/icons") {
                isPublic = true
                break
            }
        }
        if isPublic {
            next.ServeHTTP(w, r)
            return
        }

        // Verificar cookie de sessão
        cookie, err := r.Cookie("darkpay_session")
        if err != nil || !validateSessionCookie(cookie.Value) {
            http.Redirect(w, r, "/login?next="+url.PathEscape(path), http.StatusFound)
            return
        }

        next.ServeHTTP(w, r)
    })
}
```

---

## 13. Healthcheck

```go
GET /api/health → 200 OK

{
  "ok": true,
  "service": "darkpay",
  "time": "2026-07-20T01:00:00Z",
  "database": "ok",
  "env": "production",
  "security": {
    "production": true,
    "mockAllowed": false,
    "sessionSecretConfigured": true,
    "admin2faRequired": true,
    "podpayWebhookHmac": true,
    "velanaWebhookHmac": false,
    "csrfStrict": true,
    "webhookQueueSize": 0
  },
  "features": {
    "podpayKey": true,
    "email": false
  }
}
```

---

## 14. Upload de Arquivos

O app usa **UploadThing** para upload de documentos (selfie, doc_frente, doc_verso, contrato_social) e avatares.

**Recomendação Go:** Substituir por:
- Upload direto para S3 (AWS SDK Go v2)
- Ou manter UploadThing via API REST (chamada do frontend)
- Ou implementar `multipart/form-data` handler + disco local (dev)

Políticas de upload:
- Documentos: max 1.2MB, apenas `image/*` e `application/pdf`
- Avatar: max 1.5MB, apenas `image/*`

---

## Notas Importantes para a Migração

1. **Transações DB:** Toda operação que altera saldo + status de cobrança deve estar em `BEGIN/COMMIT`. O Go `database/sql` + `pgx` suportam transações nativamente.

2. **Idempotência:** Webhooks podem chegar duplicados. Sempre usar `UPDATE ... WHERE status='pendente'` e verificar `RowsAffected`.

3. **Concorrência:** Saques concorrentes usam `UPDATE ... WHERE balance_available >= amount` para garantir atomicidade sem lock explícito.

4. **In-memory Store:** O original usa `globalThis` como cache. **REMOVER em Go** — usar queries DB diretamente. Se precisar de cache, usar Redis.

5. **Task Queue:** Webhooks do original são fire-and-forget. **MELHORAR** com Asynq para garantir entrega e retry.

6. **Decimal:** Usar `github.com/shopspring/decimal` para valores monetários, ou `int64` em centavos (mais seguro).

7. **IDs:** Formato `prefixo_randomBase64`. Ex: `usr_`, `pay_`, `TX-`, `SQ-`, `mgr_`, `tok_`. Gerar com `crypto/rand`.

8. **PII:** NUNCA logar customer name, email, document ou phone. Usar structured logging com zerolog e redact PII fields.
