-- =============================================================================
-- DarkPay — schema MySQL COMPLETO (espelho de todas as telas do produto)
-- Arquivo: darkpay.sql
--
-- Painel SELLER: Dashboard, Transações, Financeiro, Taxas, Integrações,
--                Configurações (perfil, docs, notif, 2FA), Auth
-- Painel ADMIN:  Dashboard, Usuários, Gerentes, Saques, Adquirentes
--                (Gerenciamento + Credenciais), Personalização
--
-- Importar:
--   mysql -u root -p < darkpay.sql
-- =============================================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS `darkpay`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `darkpay`;

-- Drop (ordem FKs)
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `metric_daily`;
DROP TABLE IF EXISTS `balance_ledger`;
DROP TABLE IF EXISTS `sale_notifications`;
DROP TABLE IF EXISTS `notification_settings`;
DROP TABLE IF EXISTS `webhook_deliveries`;
DROP TABLE IF EXISTS `webhook_endpoints`;
DROP TABLE IF EXISTS `integration_utmify`;
DROP TABLE IF EXISTS `api_credentials`;
DROP TABLE IF EXISTS `password_resets`;
DROP TABLE IF EXISTS `sessions`;
DROP TABLE IF EXISTS `user_2fa`;
DROP TABLE IF EXISTS `brand_banners`;
DROP TABLE IF EXISTS `branding`;
DROP TABLE IF EXISTS `platform_fee_plans`;
DROP TABLE IF EXISTS `seller_custom_acquirers`;
DROP TABLE IF EXISTS `user_acquirers`;
DROP TABLE IF EXISTS `payment_charges`;
DROP TABLE IF EXISTS `documents`;
DROP TABLE IF EXISTS `withdrawals`;
DROP TABLE IF EXISTS `transactions`;
DROP TABLE IF EXISTS `acquirers`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `managers`;

-- =============================================================================
-- 1) GERENTES  → Admin / Gerentes
--    Cards: total, ativos, inativos | Ações: criar, ativar, desativar, permissões
-- =============================================================================
CREATE TABLE `managers` (
  `id`           VARCHAR(64)   NOT NULL,
  `name`         VARCHAR(191)  NOT NULL,
  `email`        VARCHAR(191)  NOT NULL,
  `phone`        VARCHAR(32)   NULL,
  `document`     VARCHAR(32)   NULL COMMENT 'CPF',
  `status`       VARCHAR(32)   NOT NULL DEFAULT 'ativo' COMMENT 'ativo | inativo',
  `permissions`  JSON          NOT NULL COMMENT 'dashboard,usuarios,documentos,saques,adquirentes,gerentes',
  `sellersCount` INT           NOT NULL DEFAULT 0,
  `volumeTotal`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  `originUserId` VARCHAR(64)   NULL COMMENT 'seller promovido a gerente',
  `createdAt`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `managers_email_key` (`email`),
  KEY `managers_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 2) USERS  → Admin / Usuários + Seller perfil/dashboard
--    Cards admin: total, ativos, pendentes, bloqueados, hoje, novos
--    Saldos seller: disponível, pendente, retido
--    Taxas: MDR % / fixo · saque % / fixo
--    Ações: ativar, bloquear, docs, taxas, adquirentes, saque automático
-- =============================================================================
CREATE TABLE `users` (
  `id`                    VARCHAR(64)   NOT NULL,
  `name`                  VARCHAR(191)  NOT NULL,
  `email`                 VARCHAR(191)  NOT NULL,
  `passwordHash`          VARCHAR(255)  NULL,
  `phone`                 VARCHAR(32)   NULL,
  `document`              VARCHAR(32)   NULL COMMENT 'CPF/CNPJ dígitos',
  `personType`            VARCHAR(8)    NOT NULL DEFAULT 'pf' COMMENT 'pf | pj',
  `status`                VARCHAR(32)   NOT NULL DEFAULT 'pendente' COMMENT 'ativo | pendente | bloqueado',
  `roles`                 JSON          NOT NULL COMMENT 'seller | admin | manager',
  `avatarUrl`             TEXT          NULL,
  `displayName`           VARCHAR(191)  NULL,
  `company`               VARCHAR(191)  NULL,
  `cnpj`                  VARCHAR(20)   NULL,
  `address`               VARCHAR(255)  NULL,
  `city`                  VARCHAR(128)  NULL,
  `state`                 VARCHAR(8)    NULL,
  `zip`                   VARCHAR(16)   NULL,
  -- Financeiro (cards saldos)
  `balanceAvailable`      DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'Saldo disponível + Sacar',
  `balancePending`        DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'Saldo pendente',
  `balanceHeld`           DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'Saldo retido',
  `volumeTotal`           DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  `platformProfit`        DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'lucro plataforma sobre o seller',
  -- Taxas personalizadas (modal admin aba Taxas)
  `mdrPercent`            DECIMAL(8,4)  NOT NULL DEFAULT 3.0000 COMMENT 'MDR % por venda',
  `mdrFixed`              DECIMAL(12,2) NOT NULL DEFAULT 0.15 COMMENT 'MDR fixo R$ por venda',
  `saquePercent`          DECIMAL(8,4)  NOT NULL DEFAULT 0.0000 COMMENT '% sobre saque',
  `saqueFixed`            DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'fixo R$ por saque',
  -- Rota / saque automático
  `saqueAutomatico`       TINYINT(1)    NOT NULL DEFAULT 0,
  `routingMode`           VARCHAR(32)   NOT NULL DEFAULT 'plataforma' COMMENT 'plataforma | personalizado',
  `preferredAdquirenteId` VARCHAR(64)   NULL,
  `managerId`             VARCHAR(64)   NULL,
  `lastLoginAt`           DATETIME(3)   NULL,
  `createdAt`             DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`             DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_key` (`email`),
  KEY `users_status_idx` (`status`),
  KEY `users_createdAt_idx` (`createdAt`),
  KEY `users_managerId_idx` (`managerId`),
  CONSTRAINT `users_managerId_fkey`
    FOREIGN KEY (`managerId`) REFERENCES `managers` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 3) AUTH  → Login / Registro / Esqueci senha / Redefinir / Sessão
-- =============================================================================
CREATE TABLE `sessions` (
  `id`        VARCHAR(64)  NOT NULL,
  `userId`    VARCHAR(64)  NOT NULL,
  `token`     VARCHAR(255) NOT NULL,
  `expiresAt` DATETIME(3)  NOT NULL,
  `ip`        VARCHAR(64)  NULL,
  `userAgent` VARCHAR(512) NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `sessions_token_key` (`token`),
  KEY `sessions_userId_idx` (`userId`),
  CONSTRAINT `sessions_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `password_resets` (
  `id`        VARCHAR(64)  NOT NULL,
  `userId`    VARCHAR(64)  NOT NULL,
  `email`     VARCHAR(191) NOT NULL,
  `token`     VARCHAR(255) NOT NULL,
  `expiresAt` DATETIME(3)  NOT NULL,
  `usedAt`    DATETIME(3)  NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `password_resets_token_key` (`token`),
  KEY `password_resets_userId_idx` (`userId`),
  CONSTRAINT `password_resets_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 4) 2FA  → Configurações / Segurança (ativar / desativar)
-- =============================================================================
CREATE TABLE `user_2fa` (
  `userId`      VARCHAR(64)  NOT NULL,
  `enabled`     TINYINT(1)   NOT NULL DEFAULT 0,
  `secret`      VARCHAR(255) NULL COMMENT 'TOTP secret',
  `backupCodes` JSON         NULL,
  `enabledAt`   DATETIME(3)  NULL,
  `updatedAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`),
  CONSTRAINT `user_2fa_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 5) DOCUMENTOS KYC  → Config / Meus documentos + Admin modal Documentos
--    Kinds: selfie, doc_frente, doc_verso, contrato_social
--    Ações: Ativar (aprovar), Revisar, Bloquear
-- =============================================================================
CREATE TABLE `documents` (
  `id`          VARCHAR(64)  NOT NULL,
  `userId`      VARCHAR(64)  NOT NULL,
  `userName`    VARCHAR(191) NOT NULL,
  `userEmail`   VARCHAR(191) NOT NULL,
  `kind`        VARCHAR(64)  NOT NULL COMMENT 'selfie | doc_frente | doc_verso | contrato_social',
  `typeLabel`   VARCHAR(128) NOT NULL,
  `submittedAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `status`      VARCHAR(32)  NOT NULL DEFAULT 'pendente' COMMENT 'pendente | aprovado | rejeitado',
  `previewUrl`  TEXT         NULL,
  `notes`       TEXT         NULL,
  `reviewedBy`  VARCHAR(64)  NULL,
  `reviewedAt`  DATETIME(3)  NULL,
  `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `documents_userId_idx` (`userId`),
  KEY `documents_status_idx` (`status`),
  CONSTRAINT `documents_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 6) ADQUIRENTES  → Admin / Adquirentes (Gerenciamento + Credenciais)
--    Cards: volume, TXs, total, ativos, manutenção, inativos, taxas pagas,
--           ticket médio, reembolsados
--    Ações: ativar, manutenção, desativar, prioridade ↑↓, salvar chaves
-- =============================================================================
CREATE TABLE `acquirers` (
  `id`              VARCHAR(64)   NOT NULL,
  `name`            VARCHAR(191)  NOT NULL,
  `code`            VARCHAR(64)   NOT NULL,
  `status`          VARCHAR(32)   NOT NULL DEFAULT 'ativo' COMMENT 'ativo | inativo | manutencao',
  `feePercent`      DECIMAL(8,4)  NOT NULL DEFAULT 0.0000,
  `feeFixed`        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `volumeMes`       DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  `transactionsMes` INT           NOT NULL DEFAULT 0,
  `settlement`      VARCHAR(32)   NOT NULL DEFAULT 'D+0' COMMENT 'D+0 | D+1 | D+2',
  `priority`        INT           NOT NULL DEFAULT 99 COMMENT 'ordem na rota (1 = principal)',
  `conversionRate`  DECIMAL(8,4)  NOT NULL DEFAULT 0.0000,
  `publicKey`       TEXT          NULL COMMENT 'Credenciais → chave pública',
  `privateKey`      TEXT          NULL COMMENT 'Credenciais → chave privada',
  `env`             VARCHAR(32)   NOT NULL DEFAULT 'sandbox' COMMENT 'sandbox | live',
  `enabled`         TINYINT(1)    NOT NULL DEFAULT 1,
  `isPrimary`       TINYINT(1)    NOT NULL DEFAULT 0 COMMENT 'ex.: PodPay',
  `createdAt`       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `acquirers_code_key` (`code`),
  KEY `acquirers_status_idx` (`status`),
  KEY `acquirers_priority_idx` (`priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Rota seller × adquirentes da plataforma (modal aba Adquirentes)
CREATE TABLE `user_acquirers` (
  `userId`     VARCHAR(64) NOT NULL,
  `acquirerId` VARCHAR(64) NOT NULL,
  `enabled`    TINYINT(1)  NOT NULL DEFAULT 1,
  `createdAt`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`, `acquirerId`),
  KEY `user_acquirers_acquirerId_idx` (`acquirerId`),
  CONSTRAINT `user_acquirers_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_acquirers_acquirerId_fkey`
    FOREIGN KEY (`acquirerId`) REFERENCES `acquirers` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Adquirentes personalizados só do seller (nicho white/black)
CREATE TABLE `seller_custom_acquirers` (
  `id`         VARCHAR(64)   NOT NULL,
  `userId`     VARCHAR(64)   NOT NULL,
  `name`       VARCHAR(191)  NOT NULL,
  `feePercent` DECIMAL(8,4)  NOT NULL DEFAULT 0.0000,
  `feeFixed`   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `settlement` VARCHAR(32)   NOT NULL DEFAULT 'D+0',
  `enabled`    TINYINT(1)    NOT NULL DEFAULT 1,
  `createdAt`  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `seller_custom_acquirers_userId_idx` (`userId`),
  CONSTRAINT `seller_custom_acquirers_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 7) TRANSAÇÕES (vendas)  → Seller / Transações + Admin ledger
--    Cards seller: pagos, pendentes, ticket médio, recusados, reembolsos, conversão
--    Status: pendente | aprovada | recusada | reembolsada
-- =============================================================================
CREATE TABLE `transactions` (
  `id`              VARCHAR(64)   NOT NULL,
  `date`            DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sellerId`        VARCHAR(64)   NOT NULL,
  `sellerName`      VARCHAR(191)  NULL,
  `kind`            VARCHAR(32)   NOT NULL DEFAULT 'venda' COMMENT 'venda | saque | ajuste',
  `direction`       VARCHAR(32)   NOT NULL DEFAULT 'entrada' COMMENT 'entrada | saida',
  `description`     VARCHAR(255)  NOT NULL DEFAULT '',
  `method`          VARCHAR(32)   NOT NULL DEFAULT 'PIX' COMMENT 'PIX | credit_card | boleto',
  `amount`          DECIMAL(18,2) NOT NULL,
  `feeAmount`       DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'MDR cobrado nesta venda',
  `netAmount`       DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'líquido seller',
  `platformFee`     DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'receita plataforma',
  `status`          VARCHAR(32)   NOT NULL DEFAULT 'pendente' COMMENT 'pendente | aprovada | recusada | reembolsada',
  `customer`        VARCHAR(191)  NULL,
  `customerEmail`   VARCHAR(191)  NULL,
  `customerDocument` VARCHAR(32)  NULL,
  `product`         VARCHAR(191)  NULL,
  `acquirerId`      VARCHAR(64)   NULL,
  `provider`        VARCHAR(64)   NULL COMMENT 'podpay | mock',
  `providerId`      VARCHAR(128)  NULL,
  `paidAt`          DATETIME(3)   NULL,
  `refundedAt`      DATETIME(3)   NULL,
  `createdAt`       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `transactions_sellerId_idx` (`sellerId`),
  KEY `transactions_status_idx` (`status`),
  KEY `transactions_date_idx` (`date`),
  KEY `transactions_providerId_idx` (`providerId`),
  KEY `transactions_acquirerId_idx` (`acquirerId`),
  CONSTRAINT `transactions_sellerId_fkey`
    FOREIGN KEY (`sellerId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 8) SAQUES  → Seller Financeiro (Sacar) + Admin / Saques
--    Cards admin: total pago, esperando liberação, lucro sobre saque,
--                 aprovados, pendentes, recusados
--    Ações admin: aprovar (pago), recusar
-- =============================================================================
CREATE TABLE `withdrawals` (
  `id`            VARCHAR(64)   NOT NULL,
  `date`          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sellerId`      VARCHAR(64)   NOT NULL,
  `sellerName`    VARCHAR(191)  NOT NULL,
  `amount`        DECIMAL(18,2) NOT NULL COMMENT 'valor solicitado',
  `feePercent`    DECIMAL(8,4)  NOT NULL DEFAULT 0.0000,
  `feeFixed`      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `feeAmount`     DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'taxa total cobrada',
  `netAmount`     DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'líquido ao seller',
  `method`        VARCHAR(32)   NOT NULL DEFAULT 'PIX',
  `destination`   VARCHAR(255)  NOT NULL COMMENT 'chave PIX',
  `pixKeyType`    VARCHAR(32)   NULL COMMENT 'cpf | cnpj | email | phone | evp',
  `status`        VARCHAR(32)   NOT NULL DEFAULT 'processando' COMMENT 'processando | pago | recusado',
  `provider`      VARCHAR(64)   NULL,
  `providerId`    VARCHAR(128)  NULL,
  `reviewedBy`    VARCHAR(64)   NULL COMMENT 'admin que aprovou/recusou',
  `reviewedAt`    DATETIME(3)   NULL,
  `failureReason` TEXT          NULL,
  `createdAt`     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `withdrawals_sellerId_idx` (`sellerId`),
  KEY `withdrawals_status_idx` (`status`),
  KEY `withdrawals_date_idx` (`date`),
  CONSTRAINT `withdrawals_sellerId_fkey`
    FOREIGN KEY (`sellerId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 9) COBRANÇAS PIX  → Integrações / Pagamentos (playground) + API
-- =============================================================================
CREATE TABLE `payment_charges` (
  `id`               VARCHAR(64)   NOT NULL,
  `sellerId`         VARCHAR(64)   NOT NULL,
  `amount`           DECIMAL(18,2) NOT NULL,
  `currency`         VARCHAR(8)    NOT NULL DEFAULT 'BRL',
  `status`           VARCHAR(32)   NOT NULL DEFAULT 'waiting_payment'
                       COMMENT 'waiting_payment | paid | expired | cancelled | refunded',
  `method`           VARCHAR(32)   NOT NULL DEFAULT 'PIX',
  `description`      VARCHAR(255)  NULL,
  `customerName`     VARCHAR(191)  NULL,
  `customerDocument` VARCHAR(32)   NULL,
  `metadata`         JSON          NULL,
  `pixQrCode`        TEXT          NULL,
  `pixCopyPaste`     TEXT          NULL,
  `expiresAt`        DATETIME(3)   NOT NULL,
  `paidAt`           DATETIME(3)   NULL,
  `transactionId`    VARCHAR(64)   NULL COMMENT 'FK lógica → transactions.id',
  `provider`         VARCHAR(64)   NULL,
  `providerId`       VARCHAR(128)  NULL,
  `createdAt`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `payment_charges_sellerId_idx` (`sellerId`),
  KEY `payment_charges_status_idx` (`status`),
  KEY `payment_charges_providerId_idx` (`providerId`),
  CONSTRAINT `payment_charges_sellerId_fkey`
    FOREIGN KEY (`sellerId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 10) LEDGER DE SALDO  → base dos cards (disponível / pendente / retido / saídas)
--     Cada movimento atualiza users.balance*
-- =============================================================================
CREATE TABLE `balance_ledger` (
  `id`            VARCHAR(64)   NOT NULL,
  `userId`        VARCHAR(64)   NOT NULL,
  `type`          VARCHAR(64)   NOT NULL
    COMMENT 'sale_pending | sale_available | sale_fee | hold | release_hold | withdrawal | withdrawal_fee | adjustment | refund',
  `amount`        DECIMAL(18,2) NOT NULL COMMENT 'sinal: + crédito / - débito no bucket',
  `bucket`        VARCHAR(32)   NOT NULL COMMENT 'available | pending | held',
  `balanceAfter`  DECIMAL(18,2) NULL,
  `referenceType` VARCHAR(64)   NULL COMMENT 'transaction | withdrawal | charge | manual',
  `referenceId`   VARCHAR(64)   NULL,
  `description`   VARCHAR(255)  NULL,
  `createdAt`     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `balance_ledger_userId_idx` (`userId`),
  KEY `balance_ledger_createdAt_idx` (`createdAt`),
  KEY `balance_ledger_type_idx` (`type`),
  CONSTRAINT `balance_ledger_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 11) MÉTRICAS DIÁRIAS  → Dashboard gráfico de volume + cards agregados
--     Seller: lucro líquido, total TXs, ticket médio, total saídas, conversão
--     Admin: volume processado, receita plataforma, conversão, ticket médio
-- =============================================================================
CREATE TABLE `metric_daily` (
  `id`                 BIGINT        NOT NULL AUTO_INCREMENT,
  `scope`              VARCHAR(32)   NOT NULL COMMENT 'seller | platform',
  `userId`             VARCHAR(64)   NULL COMMENT 'NULL = métrica global admin',
  `date`               DATE          NOT NULL,
  `volumeGross`        DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'volume processado',
  `volumeNet`          DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  `platformRevenue`    DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'receita da plataforma / MDR',
  `sellerProfit`       DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'lucro líquido seller',
  `txCount`            INT           NOT NULL DEFAULT 0,
  `txPaid`             INT           NOT NULL DEFAULT 0,
  `txPending`          INT           NOT NULL DEFAULT 0,
  `txFailed`           INT           NOT NULL DEFAULT 0,
  `txRefunded`         INT           NOT NULL DEFAULT 0,
  `averageTicket`      DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  `conversionRate`     DECIMAL(8,4)  NOT NULL DEFAULT 0.0000 COMMENT '0–100',
  `outflowTotal`       DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'total de saídas / saques',
  `withdrawalCount`    INT           NOT NULL DEFAULT 0,
  `withdrawalPaid`     DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  `withdrawalPending`  DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  `withdrawalFees`     DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'lucro sobre saque',
  `heldBalanceEod`     DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'saldo retido fim do dia',
  `createdAt`          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `metric_daily_scope_user_date` (`scope`, `userId`, `date`),
  KEY `metric_daily_date_idx` (`date`),
  KEY `metric_daily_userId_idx` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 12) PLANOS DE TAXA  → Seller / Taxas (Pix D+0 3% + R$0,15)
-- =============================================================================
CREATE TABLE `platform_fee_plans` (
  `id`              VARCHAR(64)   NOT NULL,
  `name`            VARCHAR(191)  NOT NULL COMMENT 'ex.: Pix D+0',
  `method`          VARCHAR(32)   NOT NULL DEFAULT 'PIX',
  `settlement`      VARCHAR(32)   NOT NULL DEFAULT 'D+0',
  `mdrPercent`      DECIMAL(8,4)  NOT NULL DEFAULT 3.0000,
  `mdrFixed`        DECIMAL(12,2) NOT NULL DEFAULT 0.15,
  `reserveDays`     INT           NOT NULL DEFAULT 0 COMMENT 'reserva financeira em dias',
  `description`     TEXT          NULL,
  `active`          TINYINT(1)    NOT NULL DEFAULT 1,
  `sortOrder`       INT           NOT NULL DEFAULT 0,
  `createdAt`       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 13) PERSONALIZAÇÃO  → Admin / Personalização
--     Logo, ícone, imagem auth, banners (carousel nome+link)
-- =============================================================================
CREATE TABLE `branding` (
  `id`           VARCHAR(64) NOT NULL DEFAULT 'default',
  `logoUrl`      TEXT        NOT NULL,
  `faviconUrl`   TEXT        NOT NULL,
  `authImageUrl` TEXT        NOT NULL,
  `updatedAt`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `brand_banners` (
  `id`        VARCHAR(64)  NOT NULL,
  `imageUrl`  TEXT         NOT NULL,
  `name`      VARCHAR(191) NOT NULL DEFAULT '',
  `linkUrl`   VARCHAR(512) NOT NULL DEFAULT '',
  `sortOrder` INT          NOT NULL DEFAULT 0,
  `active`    TINYINT(1)   NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `brand_banners_sortOrder_idx` (`sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 14) API KEYS  → Integrações / API
--     Permissões: transacoes, saques, checkouts, conta
--     Ações: criar, regenerar, excluir, copiar
-- =============================================================================
CREATE TABLE `api_credentials` (
  `id`            VARCHAR(64)  NOT NULL,
  `userId`        VARCHAR(64)  NOT NULL,
  `name`          VARCHAR(191) NOT NULL DEFAULT 'API Integração',
  `publicKey`     VARCHAR(128) NOT NULL,
  `secretKeyHash` VARCHAR(255) NOT NULL COMMENT 'hash da secret (nunca plain em prod)',
  `secretKeyHint` VARCHAR(32)  NULL COMMENT 'últimos 4 chars p/ UI',
  `permissions`   JSON         NOT NULL COMMENT 'transacoes,saques,checkouts,conta',
  `active`        TINYINT(1)   NOT NULL DEFAULT 1,
  `lastUsedAt`    DATETIME(3)  NULL,
  `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_credentials_publicKey_key` (`publicKey`),
  KEY `api_credentials_userId_idx` (`userId`),
  CONSTRAINT `api_credentials_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 15) WEBHOOKS OUTBOUND  → Integrações / Webhooks (seller)
-- =============================================================================
CREATE TABLE `webhook_endpoints` (
  `id`        VARCHAR(64)  NOT NULL,
  `userId`    VARCHAR(64)  NOT NULL,
  `url`       VARCHAR(512) NOT NULL,
  `secret`    VARCHAR(255) NULL,
  `events`    JSON         NOT NULL COMMENT 'transaction.*, withdrawal.*',
  `active`    TINYINT(1)   NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `webhook_endpoints_userId_idx` (`userId`),
  CONSTRAINT `webhook_endpoints_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `webhook_deliveries` (
  `id`           VARCHAR(64)  NOT NULL,
  `endpointId`   VARCHAR(64)  NOT NULL,
  `event`        VARCHAR(128) NOT NULL,
  `payload`      JSON         NOT NULL,
  `statusCode`   INT          NULL,
  `success`      TINYINT(1)   NOT NULL DEFAULT 0,
  `attempts`     INT          NOT NULL DEFAULT 0,
  `lastError`    TEXT         NULL,
  `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deliveredAt`  DATETIME(3)  NULL,
  PRIMARY KEY (`id`),
  KEY `webhook_deliveries_endpointId_idx` (`endpointId`),
  CONSTRAINT `webhook_deliveries_endpointId_fkey`
    FOREIGN KEY (`endpointId`) REFERENCES `webhook_endpoints` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 16) UTMIFY  → Integrações / UTMify
-- =============================================================================
CREATE TABLE `integration_utmify` (
  `id`        VARCHAR(64)  NOT NULL,
  `userId`    VARCHAR(64)  NOT NULL,
  `apiToken`  TEXT         NULL,
  `active`    TINYINT(1)   NOT NULL DEFAULT 0,
  `settings`  JSON         NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `integration_utmify_userId_key` (`userId`),
  CONSTRAINT `integration_utmify_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 17) NOTIFICAÇÕES  → Config / Notificações + toasts de venda
-- =============================================================================
CREATE TABLE `notification_settings` (
  `userId`              VARCHAR(64) NOT NULL,
  `saleToastEnabled`    TINYINT(1)  NOT NULL DEFAULT 1,
  `saleSoundEnabled`    TINYINT(1)  NOT NULL DEFAULT 1,
  `emailOnSale`         TINYINT(1)  NOT NULL DEFAULT 0,
  `emailOnWithdrawal`   TINYINT(1)  NOT NULL DEFAULT 1,
  `emailOnDocReview`    TINYINT(1)  NOT NULL DEFAULT 1,
  `updatedAt`           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`userId`),
  CONSTRAINT `notification_settings_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sale_notifications` (
  `id`            VARCHAR(64)   NOT NULL,
  `userId`        VARCHAR(64)   NOT NULL,
  `transactionId` VARCHAR(64)   NULL,
  `title`         VARCHAR(191)  NOT NULL,
  `body`          VARCHAR(512)  NULL,
  `amount`        DECIMAL(18,2) NULL,
  `readAt`        DATETIME(3)   NULL,
  `createdAt`     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `sale_notifications_userId_idx` (`userId`),
  CONSTRAINT `sale_notifications_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 18) AUDIT LOG  → rastreio de botões admin (ativar, bloquear, aprovar saque…)
-- =============================================================================
CREATE TABLE `audit_logs` (
  `id`         VARCHAR(64)  NOT NULL,
  `actorId`    VARCHAR(64)  NULL COMMENT 'admin/gerente',
  `actorEmail` VARCHAR(191) NULL,
  `action`     VARCHAR(128) NOT NULL
    COMMENT 'user.activate | user.block | doc.approve | withdrawal.pay | acquirer.status | fees.save | branding.save | credentials.save',
  `entityType` VARCHAR(64)  NULL,
  `entityId`   VARCHAR(64)  NULL,
  `meta`       JSON         NULL,
  `ip`         VARCHAR(64)  NULL,
  `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `audit_logs_actorId_idx` (`actorId`),
  KEY `audit_logs_action_idx` (`action`),
  KEY `audit_logs_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- SEEDS — dados base alinhados à UI demo
-- =============================================================================

INSERT INTO `managers` (`id`, `name`, `email`, `phone`, `status`, `permissions`, `sellersCount`, `volumeTotal`)
VALUES (
  'mgr_01',
  'Gerente Demo',
  'gerente@darkpay.app',
  '11988887777',
  'ativo',
  JSON_ARRAY('dashboard', 'usuarios', 'documentos', 'saques', 'adquirentes'),
  1,
  880900.00
);

INSERT INTO `users` (
  `id`, `name`, `email`, `passwordHash`, `phone`, `document`, `personType`, `status`, `roles`,
  `displayName`, `balanceAvailable`, `balancePending`, `balanceHeld`, `volumeTotal`, `platformProfit`,
  `mdrPercent`, `mdrFixed`, `saquePercent`, `saqueFixed`, `saqueAutomatico`, `routingMode`, `managerId`
) VALUES
(
  'usr_admin',
  'Admin DarkPay',
  'admin@darkpay.app',
  '$2b$10$F804Zd0JZv.SdbB3BroeLeth6m0m6qmn0ULQIljKdKCYhpv.rVZsS',
  NULL, NULL, 'pj', 'ativo', JSON_ARRAY('admin'),
  'Admin DarkPay',
  0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 'plataforma', NULL
),
(
  'usr_01',
  'Igor Rocha',
  'igor@darkpay.app',
  '$2b$10$F804Zd0JZv.SdbB3BroeLeth6m0m6qmn0ULQIljKdKCYhpv.rVZsS',
  '11999999999', '52998224725', 'pf', 'ativo', JSON_ARRAY('seller'),
  'Igor Rocha',
  788901.86, 197225.46, 49306.37, 880900.00, 116357.47,
  3.0000, 0.15, 0, 0, 0, 'plataforma', 'mgr_01'
);

INSERT INTO `user_2fa` (`userId`, `enabled`) VALUES ('usr_01', 0), ('usr_admin', 0);

INSERT INTO `notification_settings` (`userId`) VALUES ('usr_01'), ('usr_admin');

INSERT INTO `acquirers` (
  `id`, `name`, `code`, `status`, `feePercent`, `feeFixed`, `settlement`, `priority`,
  `conversionRate`, `env`, `enabled`, `isPrimary`
) VALUES
('podpay', 'PodPay', 'PODPAY', 'ativo', 1.4900, 0.15, 'D+0', 1, 94.2000, 'sandbox', 1, 1),
('velana', 'Velana', 'VELANA', 'ativo', 0.0000, 0.80, 'D+0', 2, 0, 'live', 1, 0),
('acq_01', 'SafraPay', 'SAFRA', 'ativo', 1.4900, 0.15, 'D+0', 3, 94.2000, 'live', 1, 0),
('acq_02', 'Pagar.me', 'PAGARME', 'ativo', 1.7900, 0.20, 'D+1', 4, 91.5000, 'live', 1, 0),
('acq_03', 'Mercado Pago', 'MPAGO', 'ativo', 1.9900, 0.00, 'D+0', 5, 88.7000, 'live', 1, 0),
('acq_04', 'Cielo', 'CIELO', 'manutencao', 1.6500, 0.25, 'D+1', 6, 82.1000, 'live', 1, 0),
('acq_05', 'Rede', 'REDE', 'inativo', 1.8900, 0.30, 'D+2', 7, 0, 'live', 0, 0);

INSERT INTO `user_acquirers` (`userId`, `acquirerId`, `enabled`) VALUES
('usr_01', 'podpay', 1),
('usr_01', 'velana', 1),
('usr_01', 'acq_01', 1),
('usr_01', 'acq_02', 1);

INSERT INTO `platform_fee_plans` (`id`, `name`, `method`, `settlement`, `mdrPercent`, `mdrFixed`, `reserveDays`, `description`, `active`, `sortOrder`)
VALUES (
  'fee_pix_d0',
  'Pix D+0',
  'PIX',
  'D+0',
  3.0000,
  0.15,
  0,
  'PIX é o novo meio de pagamento instantâneo da plataforma.',
  1,
  0
);

INSERT INTO `branding` (`id`, `logoUrl`, `faviconUrl`, `authImageUrl`)
VALUES (
  'default',
  '/logo-darkpay-header.png',
  '/logo-darkpay-clean.jpg',
  '/banner-darkpay.jpg'
);

INSERT INTO `brand_banners` (`id`, `imageUrl`, `name`, `linkUrl`, `sortOrder`, `active`)
VALUES (
  'ban_01',
  '/banner-darkpay.jpg',
  'Banner principal',
  '',
  0,
  1
);

-- Métrica diária de exemplo (dashboard seller + admin)
INSERT INTO `metric_daily` (
  `scope`, `userId`, `date`,
  `volumeGross`, `volumeNet`, `platformRevenue`, `sellerProfit`,
  `txCount`, `txPaid`, `txPending`, `txFailed`, `txRefunded`,
  `averageTicket`, `conversionRate`, `outflowTotal`, `withdrawalCount`,
  `withdrawalPaid`, `withdrawalPending`, `withdrawalFees`, `heldBalanceEod`
) VALUES
(
  'seller', 'usr_01', CURDATE(),
  880900.00, 764542.53, 116357.47, 116357.47,
  162, 150, 8, 3, 1,
  397.54, 90.0000, 42850.00, 5,
  38000.00, 4850.00, 0.00, 49306.37
),
(
  'platform', NULL, CURDATE(),
  880900.00, 764542.53, 116357.47, 0,
  162, 150, 8, 3, 1,
  397.54, 91.4000, 42850.00, 5,
  38000.00, 4850.00, 1200.00, 49306.37
);

-- =============================================================================
-- MAPA RÁPIDO UI → TABELAS
-- -----------------------------------------------------------------------------
-- SELLER Dashboard          → users.balance*, metric_daily (seller), transactions
-- SELLER Transações         → transactions
-- SELLER Financeiro + Sacar → users.balance*, withdrawals, balance_ledger
-- SELLER Taxas              → platform_fee_plans (+ users.mdr*)
-- SELLER Integrações API    → api_credentials
-- SELLER Webhooks           → webhook_endpoints, webhook_deliveries
-- SELLER UTMify             → integration_utmify
-- SELLER PodPay hub         → acquirers (privateKey/publicKey) + payment_charges
-- SELLER Perfil             → users
-- SELLER Documentos         → documents
-- SELLER Notificações       → notification_settings, sale_notifications
-- SELLER Segurança 2FA      → user_2fa
-- AUTH login/registro/senha → users, sessions, password_resets
-- ADMIN Dashboard           → metric_daily (platform), transactions, users
-- ADMIN Usuários            → users, documents, user_acquirers, seller_custom_acquirers
-- ADMIN Gerentes            → managers, users.managerId
-- ADMIN Saques              → withdrawals
-- ADMIN Adquirentes         → acquirers, user_acquirers
-- ADMIN Credenciais         → acquirers.publicKey/privateKey
-- ADMIN Personalização      → branding, brand_banners
-- =============================================================================

-- =============================================================================
-- SEEDS ADMIN — métricas dashboard + sellers + saques + ledger + gráfico
-- =============================================================================

-- Mais sellers (cards Usuários + volume / held)
INSERT INTO `users` (
  `id`, `name`, `email`, `phone`, `document`, `personType`, `status`, `roles`,
  `displayName`, `balanceAvailable`, `balancePending`, `balanceHeld`,
  `volumeTotal`, `platformProfit`, `mdrPercent`, `mdrFixed`, `createdAt`
) VALUES
('usr_02','Ana Souza','ana.souza@email.com','21977112233','23456744190','pf','ativo',JSON_ARRAY('seller'),'Ana Store',120500.00,15200.00,8200.00,540200.00,16200.00,3,0.15,'2025-09-01 10:00:00'),
('usr_03','Bruno Lima','bruno.lima@email.com','11966554433','34567855201','pf','ativo',JSON_ARRAY('seller'),'Bruno Digital',88000.00,9100.00,4500.00,312000.00,9360.00,3,0.15,'2025-09-15 11:00:00'),
('usr_04','Carla Mendes','carla@infoprodutos.io','31988776655','45678966312','pj','pendente',JSON_ARRAY('seller'),'Infoprodutos CM',0,0,0,0,0,3,0.15,'2025-12-20 09:00:00'),
('usr_05','Diego Alves','diego.alves@email.com','41977665544','56789077423','pf','ativo',JSON_ARRAY('seller'),'Diego Sales',55100.00,3200.00,2100.00,185000.00,5550.00,3,0.15,'2025-10-02 14:00:00'),
('usr_06','Elena Costa','elena.costa@email.com','51966554433','67890188534','pf','bloqueado',JSON_ARRAY('seller'),'Elena',0,0,1200.00,45000.00,1350.00,3,0.15,'2025-07-20 08:00:00'),
('usr_07','Felipe Rocha','felipe.rocha@email.com','61955443322','78901299645','pf','ativo',JSON_ARRAY('seller'),'Felipe R',210400.00,18400.00,11200.00,890000.00,26700.00,2.8,0.10,'2025-08-05 16:00:00'),
('usr_08','Gabriela Nunes','gabi.nunes@email.com','71944332211','89012300756','pf','pendente',JSON_ARRAY('seller'),'Gabi',0,0,0,0,0,3,0.15,NOW()),
('usr_09','Hugo Martins','hugo.m@email.com','81933221100','90123411867','pf','ativo',JSON_ARRAY('seller'),'Hugo M',22800.00,1500.00,900.00,96430.00,2890.00,3,0.15,'2025-11-01 12:00:00'),
('usr_10','Isabela Freitas','isa.freitas@email.com','85922110099','01234522978','pf','ativo',JSON_ARRAY('seller'),'Isa',8900.00,400.00,300.00,42000.00,1260.00,3,0.15,'2025-11-18 10:00:00');

-- Atualiza volumes das adquirentes (cards Gerenciamento)
UPDATE `acquirers` SET `volumeMes`=2140800.00, `transactionsMes`=6420, `conversionRate`=94.2000 WHERE `id`='podpay';
UPDATE `acquirers` SET `volumeMes`=1580220.50, `transactionsMes`=4110, `conversionRate`=91.5000 WHERE `id`='acq_01';
UPDATE `acquirers` SET `volumeMes`=980400.25, `transactionsMes`=2890, `conversionRate`=88.7000 WHERE `id`='acq_02';
UPDATE `acquirers` SET `volumeMes`=190920.00, `transactionsMes`=427, `conversionRate`=82.1000 WHERE `id`='acq_03';
UPDATE `acquirers` SET `volumeMes`=190920.00, `transactionsMes`=427 WHERE `id`='acq_04';

-- Transações (histórico dashboard + volume processado + receita)
INSERT INTO `transactions` (
  `id`,`date`,`sellerId`,`sellerName`,`kind`,`direction`,`description`,`method`,
  `amount`,`feeAmount`,`netAmount`,`platformFee`,`status`,`customer`,`product`,`provider`
) VALUES
('TX-20941','2025-12-23 16:45:00','usr_02','Ana Souza','venda','entrada','Curso Digital Pro','PIX',297.00,9.06,287.94,9.06,'aprovada','Cliente A','Curso Digital Pro','podpay'),
('TX-20940','2025-12-23 15:20:00','usr_01','Igor Rocha','venda','entrada','Mentoria 1:1','PIX',997.00,30.06,966.94,30.06,'aprovada','Cliente B','Mentoria 1:1','podpay'),
('TX-20939','2025-12-23 14:10:00','usr_07','Felipe Rocha','venda','entrada','E-book Premium','PIX',47.90,1.59,46.31,1.59,'pendente','Cliente C','E-book Premium','podpay'),
('TX-20938','2025-12-23 12:05:00','usr_03','Bruno Lima','venda','entrada','Assinatura Mensal','PIX',79.90,2.55,77.35,2.55,'aprovada','Cliente D','Assinatura Mensal','podpay'),
('TX-20937','2025-12-22 18:30:00','usr_05','Diego Alves','venda','entrada','Pack Templates','PIX',149.00,4.62,144.38,4.62,'aprovada','Cliente E','Pack Templates','podpay'),
('TX-20936','2025-12-22 11:00:00','usr_02','Ana Souza','venda','entrada','Workshop Live','PIX',197.00,6.06,190.94,6.06,'recusada','Cliente F','Workshop Live','podpay'),
('TX-20935','2025-12-21 20:15:00','usr_01','Igor Rocha','venda','entrada','Consultoria','PIX',1500.00,45.15,1454.85,45.15,'aprovada','Cliente G','Consultoria','podpay'),
('TX-20934','2025-12-21 09:40:00','usr_09','Hugo Martins','venda','entrada','Curso Digital Pro','PIX',297.00,9.06,287.94,9.06,'reembolsada','Cliente H','Curso Digital Pro','podpay'),
('TX-20933','2025-12-20 16:00:00','usr_07','Felipe Rocha','venda','entrada','Mentoria 1:1','PIX',997.00,28.06,968.94,28.06,'aprovada','Cliente I','Mentoria 1:1','podpay'),
('TX-20932','2025-12-19 13:22:00','usr_03','Bruno Lima','venda','entrada','E-book Premium','PIX',47.90,1.59,46.31,1.59,'aprovada','Cliente J','E-book Premium','podpay'),
('TX-20931','2025-12-18 10:10:00','usr_01','Igor Rocha','venda','entrada','Assinatura Mensal','PIX',79.90,2.55,77.35,2.55,'aprovada','Cliente K','Assinatura Mensal','podpay'),
('TX-20930','2025-12-17 17:45:00','usr_02','Ana Souza','venda','entrada','Pack Templates','PIX',149.00,4.62,144.38,4.62,'pendente','Cliente L','Pack Templates','podpay');

-- Saques (cards Admin Saques + histórico)
INSERT INTO `withdrawals` (
  `id`,`date`,`sellerId`,`sellerName`,`amount`,`feePercent`,`feeFixed`,`feeAmount`,`netAmount`,
  `method`,`destination`,`status`
) VALUES
('SQ-9001','2025-12-23 11:00:00','usr_01','Igor Rocha',25000.00,0,0,0,25000.00,'PIX','igor@darkpay.app','pago'),
('SQ-9002','2025-12-22 15:30:00','usr_02','Ana Souza',8500.00,0,5,5.00,8495.00,'PIX','ana.souza@email.com','processando'),
('SQ-9003','2025-12-21 09:00:00','usr_07','Felipe Rocha',12000.00,1,0,120.00,11880.00,'PIX','11999998888','pago'),
('SQ-9004','2025-12-20 18:20:00','usr_03','Bruno Lima',3200.00,0,0,0,3200.00,'PIX','bruno.lima@email.com','recusado'),
('SQ-9005','2025-12-19 14:00:00','usr_05','Diego Alves',4500.00,0,5,5.00,4495.00,'PIX','diego.alves@email.com','processando'),
('SQ-9006','2025-12-18 10:30:00','usr_01','Igor Rocha',15000.00,0,0,0,15000.00,'PIX','igor@darkpay.app','pago'),
('SQ-9007','2025-12-17 16:45:00','usr_09','Hugo Martins',2000.00,0,0,0,2000.00,'PIX','hugo.m@email.com','processando');

-- Série do gráfico (volume processado por dia) — Dashboard Admin
DELETE FROM `metric_daily` WHERE `scope`='platform';
INSERT INTO `metric_daily` (`scope`,`userId`,`date`,`volumeGross`,`platformRevenue`,`txCount`,`txPaid`,`averageTicket`,`conversionRate`,`outflowTotal`,`withdrawalFees`,`heldBalanceEod`) VALUES
('platform',NULL,'2025-12-14',188920.00,5667.60,496,452,380.74,91.1,12000.00,0,300000.00),
('platform',NULL,'2025-12-15',171750.00,5152.50,451,412,380.74,91.3,8500.00,0,302000.00),
('platform',NULL,'2025-12-16',204100.00,6123.00,536,490,380.74,91.4,15000.00,120.00,305000.00),
('platform',NULL,'2025-12-17',159300.00,4779.00,418,382,380.74,91.0,2000.00,0,306000.00),
('platform',NULL,'2025-12-18',175600.00,5268.00,461,421,380.74,91.2,15000.00,0,308000.00),
('platform',NULL,'2025-12-19',198900.00,5967.00,522,477,380.74,91.5,4500.00,5.00,309500.00),
('platform',NULL,'2025-12-20',241500.00,7245.00,634,579,380.74,91.6,3200.00,0,310000.00),
('platform',NULL,'2025-12-21',168200.00,5046.00,442,404,380.74,91.3,12000.00,120.00,311000.00),
('platform',NULL,'2025-12-22',212800.00,6384.00,559,511,380.74,91.4,8500.00,5.00,311800.00),
('platform',NULL,'2025-12-23',186400.00,5592.00,490,448,380.74,91.4,25000.00,0,312480.55);

-- Documentos pendentes (card compliance)
INSERT INTO `documents` (`id`,`userId`,`userName`,`userEmail`,`kind`,`typeLabel`,`status`,`submittedAt`) VALUES
('doc_01','usr_04','Carla Mendes','carla@infoprodutos.io','selfie','Selfie','pendente','2025-12-20 10:00:00'),
('doc_02','usr_04','Carla Mendes','carla@infoprodutos.io','doc_frente','RG/CNH frente','pendente','2025-12-20 10:01:00'),
('doc_03','usr_08','Gabriela Nunes','gabi.nunes@email.com','selfie','Selfie','pendente','2025-12-22 09:00:00'),
('doc_04','usr_01','Igor Rocha','igor@darkpay.app','contrato_social','Contrato social','aprovado','2025-08-12 11:00:00');

-- Liga sellers às adquirentes
INSERT IGNORE INTO `user_acquirers` (`userId`,`acquirerId`,`enabled`) VALUES
('usr_02','podpay',1),('usr_02','acq_01',1),
('usr_03','podpay',1),('usr_07','podpay',1),('usr_07','acq_02',1);

-- Gerente extra
INSERT INTO `managers` (`id`,`name`,`email`,`phone`,`status`,`permissions`,`sellersCount`,`volumeTotal`,`createdAt`)
VALUES (
  'mgr_02','Marina Costa','marina.gerente@darkpay.app','11977776666','inativo',
  JSON_ARRAY('dashboard','usuarios','saques'),0,0,'2025-06-01 10:00:00'
);



-- =============================================================================
-- SENHAS MVP (altere em produção!)
-- admin@darkpay.app / DarkPay@123
-- igor@darkpay.app  / DarkPay@123
-- =============================================================================
