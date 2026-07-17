/**
 * Seed REAL — garante usuários com senha bcrypt no MySQL.
 * Uso: npm run db:seed
 *
 * Contas:
 *   admin@darkpay.app / DarkPay@123  (admin)
 *   igor@darkpay.app  / DarkPay@123  (seller ativo)
 */
import { createRequire } from "module";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// carrega .env
const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || "DarkPay@123";

async function upsertUser(data) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        status: data.status,
        roles: data.roles,
        name: data.name,
        balanceAvailable: data.balanceAvailable ?? existing.balanceAvailable,
        balancePending: data.balancePending ?? existing.balancePending,
        balanceHeld: data.balanceHeld ?? existing.balanceHeld,
        mdrPercent: data.mdrPercent ?? 3,
        mdrFixed: data.mdrFixed ?? 0.15,
        saquePercent: data.saquePercent ?? 3,
        saqueFixed: data.saqueFixed ?? 0,
      },
    });
    console.log("✓ atualizado", data.email, "(senha redefinida)");
    return existing.id;
  }
  const id = data.id;
  await prisma.user.create({
    data: {
      id,
      name: data.name,
      email: data.email,
      passwordHash,
      status: data.status,
      roles: data.roles,
      personType: data.personType || "pf",
      displayName: data.displayName || data.name,
      phone: data.phone || null,
      document: data.document || null,
      balanceAvailable: data.balanceAvailable ?? 0,
      balancePending: data.balancePending ?? 0,
      balanceHeld: data.balanceHeld ?? 0,
      volumeTotal: data.volumeTotal ?? 0,
      mdrPercent: 3,
      mdrFixed: 0.15,
      saquePercent: 3,
      saqueFixed: 0,
    },
  });
  await prisma.user2FA.upsert({
    where: { userId: id },
    create: { userId: id, enabled: false },
    update: {},
  });
  await prisma.notificationSetting.upsert({
    where: { userId: id },
    create: { userId: id },
    update: {},
  });
  console.log("✓ criado", data.email);
  return id;
}

async function main() {
  console.log("Conectando ao banco…");
  console.log("DATABASE_URL:", (process.env.DATABASE_URL || "(vazio)").replace(/:([^:@/]+)@/, ":***@"));
  await prisma.$queryRaw`SELECT 1`;
  console.log("Banco OK\n");

  await upsertUser({
    id: "usr_admin",
    name: "Admin DarkPay",
    email: "admin@darkpay.app",
    status: "ativo",
    roles: ["admin", "seller"],
    personType: "pj",
    balanceAvailable: 0,
  });

  await upsertUser({
    id: "usr_01",
    name: "Igor Rocha",
    email: "igor@darkpay.app",
    status: "ativo",
    roles: ["seller"],
    personType: "pf",
    phone: "11999999999",
    document: "52998224725",
    // saldos reais começam zerados — sobem só com PIX pago via PodPay
    balanceAvailable: 0,
    balancePending: 0,
    balanceHeld: 0,
    volumeTotal: 0,
  });

  // Velana = rota principal (custo R$ 0,80/TX; seller 2,99% + R$ 1,00)
  const velana = await prisma.acquirer.findUnique({ where: { id: "velana" } });
  if (!velana) {
    await prisma.acquirer.create({
      data: {
        id: "velana",
        name: "Velana",
        code: "VELANA",
        status: "ativo",
        priority: 1,
        isPrimary: true,
        enabled: true,
        env: "live",
        feePercent: 0,
        feeFixed: 0.8,
        settlement: "D+0",
      },
    });
    console.log("✓ adquirente Velana (principal · custo R$ 0,80/TX)");
  } else {
    await prisma.acquirer.update({
      where: { id: "velana" },
      data: { isPrimary: true, priority: 1, enabled: true, status: "ativo" },
    });
    console.log("✓ Velana marcada como principal");
  }

  // PodPay = fallback
  const acq = await prisma.acquirer.findUnique({ where: { id: "podpay" } });
  if (!acq) {
    await prisma.acquirer.create({
      data: {
        id: "podpay",
        name: "PodPay",
        code: "PODPAY",
        status: "ativo",
        priority: 2,
        isPrimary: false,
        enabled: true,
        env: "sandbox",
        feePercent: 1.49,
        feeFixed: 0.15,
        settlement: "D+0",
      },
    });
    console.log("✓ adquirente PodPay (fallback)");
  } else {
    await prisma.acquirer.update({
      where: { id: "podpay" },
      data: { isPrimary: false, priority: 2 },
    });
  }

  await prisma.branding.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      logoUrl: "/logo-darkpay-header.png",
      faviconUrl: "/logo-darkpay-clean.jpg",
      authImageUrl: "/banner-darkpay.jpg",
    },
    update: {},
  });

  console.log("\n=== Contas reais ===");
  console.log("  admin@darkpay.app  /", PASSWORD, "(admin)");
  console.log("  igor@darkpay.app   /", PASSWORD, "(seller)");
  console.log("\nSeed concluído.");
}

main()
  .catch((e) => {
    console.error("\nFalha no seed:", e.message);
    console.error(
      "\nDica: confira DATABASE_URL no .env (local: file:./dev.db)."
    );
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
