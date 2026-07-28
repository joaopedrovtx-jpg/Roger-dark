/**
 * Localiza vendas pendentes do Dog Black e, se pagas na Woovi, credita no DarkPay.
 * Uso na VPS: node scripts/fix-dog-black-pending.mjs
 */
import { PrismaClient } from "@prisma/client";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const prisma = new PrismaClient();

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

async function loadWooviAppId() {
  const fromEnv =
    process.env.WOOVI_APP_ID?.trim() ||
    process.env.OPENPIX_APP_ID?.trim() ||
    process.env.WOOVI_APPID?.trim() ||
    process.env.WOOVI_API_KEY?.trim();
  if (fromEnv) return fromEnv;

  // Admin → Adquirentes: privateKey = AppID da Woovi
  try {
    const row = await prisma.acquirer.findFirst({
      where: {
        OR: [
          { code: "WOOVI" },
          { id: "woovi" },
          { code: "OPENPIX" },
          { id: "openpix" },
        ],
      },
      orderBy: [{ isPrimary: "desc" }, { priority: "asc" }],
    });
    const key = row?.privateKey?.trim() || row?.publicKey?.trim() || "";
    if (key) return key;
  } catch (e) {
    console.warn("acquirer lookup failed", e.message);
  }
  return null;
}

async function getWooviCharge(appId, correlationId) {
  const bases = [
    "https://api.woovi.com",
    "https://api.openpix.com.br",
  ];
  let lastErr;
  for (const base of bases) {
    try {
      const res = await fetch(
        `${base}/api/v1/charge/${encodeURIComponent(correlationId)}`,
        {
          headers: {
            Authorization: appId,
            Accept: "application/json",
          },
        }
      );
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
      if (!res.ok) {
        lastErr = `HTTP ${res.status} ${base}: ${text.slice(0, 200)}`;
        continue;
      }
      return body;
    } catch (e) {
      lastErr = e.message;
    }
  }
  throw new Error(lastErr || "woovi fetch failed");
}

async function creditSale(tx) {
  const amount = roundMoney(tx.amount);
  const fee = roundMoney(tx.feeAmount);
  const net = Math.max(0, roundMoney(amount - fee));

  return prisma.$transaction(async (db) => {
    const r = await db.transaction.updateMany({
      where: { id: tx.id, status: "pendente" },
      data: { status: "aprovada", paidAt: new Date() },
    });
    if (r.count === 0) return { credited: false, reason: "already_not_pending" };

    await db.paymentCharge.updateMany({
      where: {
        OR: [
          { transactionId: tx.id },
          { providerId: tx.providerId || "" },
          { id: `wo_${tx.providerId || ""}`.slice(0, 64) },
        ],
        status: "waiting_payment",
      },
      data: { status: "paid", paidAt: new Date() },
    });

    const user = await db.user.update({
      where: { id: tx.sellerId },
      data: {
        balancePending: { decrement: amount },
        balanceAvailable: { increment: net },
        volumeTotal: { increment: amount },
      },
      select: { balanceAvailable: true, balancePending: true, name: true },
    });

    try {
      await db.balanceLedger.create({
        data: {
          id: `led_fix_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
          userId: tx.sellerId,
          type: "credit_sale",
          amount: net,
          bucket: "available",
          balanceAfter: Number(user.balanceAvailable),
          referenceType: "transaction",
          referenceId: tx.id,
          description: "Crédito venda paga (fix Dog Black)",
        },
      });
    } catch (e) {
      console.warn("ledger skip", e.message);
    }

    return {
      credited: true,
      amount,
      fee,
      net,
      balanceAvailable: Number(user.balanceAvailable),
      balancePending: Number(user.balancePending),
    };
  });
}

async function main() {
  const force = process.argv.includes("--force");
  const dry = process.argv.includes("--dry");

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: "Dog" } },
        { name: { contains: "Black" } },
        { email: { contains: "dog" } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      balanceAvailable: true,
      balancePending: true,
    },
  });

  console.log("=== USERS MATCH ===");
  console.log(JSON.stringify(users, null, 2));

  // Prefer exact-ish name
  const dog =
    users.find((u) => /dog\s*black/i.test(u.name || "")) ||
    users.find((u) => /dog/i.test(u.name || "")) ||
    users[0];

  if (!dog) {
    console.error("Dog Black não encontrado");
    process.exit(1);
  }

  console.log("\n=== TARGET ===", dog.name, dog.id);

  const pending = await prisma.transaction.findMany({
    where: {
      sellerId: dog.id,
      status: "pendente",
      kind: "venda",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  console.log("\n=== PENDING SALES ===");
  console.log(
    JSON.stringify(
      pending.map((t) => ({
        id: t.id,
        amount: Number(t.amount),
        provider: t.provider,
        providerId: t.providerId,
        product: t.product,
        customer: t.customer,
        createdAt: t.createdAt,
        feeAmount: Number(t.feeAmount),
      })),
      null,
      2
    )
  );

  // also last 5 any status
  const recent = await prisma.transaction.findMany({
    where: { sellerId: dog.id, kind: "venda" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      status: true,
      amount: true,
      provider: true,
      providerId: true,
      product: true,
      createdAt: true,
    },
  });
  console.log("\n=== RECENT SALES ===");
  console.log(
    JSON.stringify(
      recent.map((t) => ({ ...t, amount: Number(t.amount) })),
      null,
      2
    )
  );

  if (pending.length === 0) {
    console.log("Nenhuma pendente. OK.");
    return;
  }

  const appId = await loadWooviAppId();
  console.log("\n=== WOOVI APPID ===", appId ? "ok" : "MISSING");

  for (const tx of pending) {
    console.log("\n--- check", tx.id, "providerId=", tx.providerId);
    let remoteStatus = null;
    let paidOnWoovi = false;

    if (appId && tx.providerId) {
      try {
        const body = await getWooviCharge(appId, tx.providerId);
        remoteStatus = body?.charge?.status || body?.status || null;
        console.log("woovi status:", remoteStatus, "value:", body?.charge?.value);
        const s = String(remoteStatus || "").toUpperCase();
        paidOnWoovi = ["COMPLETED", "PAID", "CONFIRMED", "RECEIVED", "APPROVED"].includes(s);
      } catch (e) {
        console.warn("woovi get failed:", e.message);
      }
    }

    if (!paidOnWoovi && !force) {
      console.log("SKIP (não confirmado pago na Woovi). Use --force se tiver certeza.");
      continue;
    }

    if (dry) {
      console.log("DRY RUN — creditaria", tx.id);
      continue;
    }

    const result = await creditSale(tx);
    console.log("CREDIT RESULT", result);
  }

  const after = await prisma.user.findUnique({
    where: { id: dog.id },
    select: {
      name: true,
      balanceAvailable: true,
      balancePending: true,
    },
  });
  console.log("\n=== BALANCE AFTER ===", after);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
