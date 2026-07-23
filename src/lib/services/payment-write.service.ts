import { randomBytes } from "crypto";
import type { Transaction } from "@/lib/domain/types";
import {
  adjustBalance,
  getStore,
  type PaymentCharge,
} from "@/lib/server/memory-store";
import {
  createChargeViaPodPay,
} from "@/lib/acquirers/podpay/gateway";
import {
  isPodPayEnabledServer,
  resolvePodPayConfigServer,
} from "@/lib/acquirers/podpay/config";
import { createChargeViaVelana } from "@/lib/acquirers/velana/gateway";
import {
  isVelanaEnabledServer,
  resolveVelanaConfigServer,
} from "@/lib/acquirers/velana/config";
import { resolveAcquirerForSeller } from "@/lib/acquirers/resolve";

export interface CreateChargeInput {
  sellerId: string;
  amount: number;
  description?: string;
  customerName?: string;
  customerDocument?: string;
  customerEmail?: string;
  customerPhone?: string;
  metadata?: Record<string, string>;
  expiresInMinutes?: number;
}

function shortId() {
  return `pay_${randomBytes(12).toString("base64url")}`;
}

function txId() {
  return `TX-${randomBytes(6).toString("hex")}`;
}

async function mockPixPayload(chargeId: string, amount: number) {
  const copy = `00020126580014BR.GOV.BCB.PIX0136${chargeId}52040000530398654${amount.toFixed(2)}5802BR5913DarkPay6009SAO PAULO62070503***6304ABCD`;
  let pixQrCode: string | undefined;
  try {
    const QRCode = (await import("qrcode")).default;
    pixQrCode = await QRCode.toDataURL(copy, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0f0c", light: "#ffffff" },
    });
  } catch {
    pixQrCode = undefined;
  }
  return { pixCopyPaste: copy, pixQrCode };
}

export async function createPixCharge(
  input: CreateChargeInput
): Promise<
  PaymentCharge & {
    provider?: string;
    routingMode?: "plataforma" | "personalizado";
    acquirerId?: string;
  }
> {
  if (!input.sellerId) throw new Error("sellerId obrigatório");
  if (!input.amount || input.amount < 1) {
    throw new Error("Valor mínimo: R$ 1,00");
  }

  {
    const { prisma, isDatabaseConfigured } = await import("@/lib/server/prisma");
    const { assertSellerCanTransact } = await import("@/lib/server/mock-check");
    if (isDatabaseConfigured()) {
      const u = await prisma.user.findUnique({
        where: { id: input.sellerId },
        select: { status: true },
      });
      if (!u) {
        throw new Error("Conta não encontrada");
      }
      assertSellerCanTransact(u.status);
    }
  }

  const active = await resolveAcquirerForSeller(input.sellerId);
  const routeMeta = {
    routingMode: active?.routingMode ?? ("plataforma" as const),
    acquirerId: active?.id,
  };

  async function viaVelana() {
    const config = await resolveVelanaConfigServer();
    if (!config?.secretKey) return null;
    // Taxas impostas na conta do seller (Admin)
    let feePercent: number | undefined;
    let feeFixed: number | undefined;
    try {
      const { getSellerSaleFees } = await import("@/lib/server/seller-fees");
      const plan = await getSellerSaleFees(input.sellerId);
      feePercent = plan.mdrPercent;
      feeFixed = plan.mdrFixed;
    } catch {
      /* gateway usa default */
    }
    const charge = await createChargeViaVelana({
      sellerId: input.sellerId,
      amount: input.amount,
      description: input.description,
      customerName: input.customerName,
      customerDocument: input.customerDocument,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      externalRef: input.metadata?.orderId || input.metadata?.externalRef,
      config,
      feePercent,
      feeFixed,
    });
    return { ...charge, provider: "velana" as const, ...routeMeta };
  }

  async function viaPodPay() {
    const config = await resolvePodPayConfigServer();
    if (!config?.apiKey) return null;
    const charge = await createChargeViaPodPay({
      sellerId: input.sellerId,
      amount: input.amount,
      description: input.description,
      customerName: input.customerName,
      customerDocument: input.customerDocument,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      config,
    });
    return { ...charge, provider: "podpay" as const, ...routeMeta };
  }

  const modeLabel =
    active?.routingMode === "personalizado"
      ? "personalizada deste seller"
      : "principal da plataforma";

  if (active?.provider === "podpay") {
    const r = await viaPodPay();
    if (r) return r;
    throw new Error(
      `Rota ${modeLabel} = PodPay, mas a chave sk_ não está configurada ou a API falhou. ` +
        "Salve a secret em Admin → Adquirentes → Credenciais (PodPay)."
    );
  }
  if (active?.provider === "velana") {
    const r = await viaVelana();
    if (r) return r;
    throw new Error(
      `Rota ${modeLabel} = Velana, mas a secret key não está configurada ou a API falhou. ` +
        "Salve pk_/sk_ em Admin → Adquirentes → Credenciais (Velana)."
    );
  }

  const pod = await viaPodPay();
  if (pod) return pod;
  const vel = await viaVelana();
  if (vel) return vel;

  const { isMockAllowed } = await import("@/lib/server/mock-check");
  if (isMockAllowed()) {
    console.warn("[payments] ALLOW_MOCK_DATA=1 cobrança MOCK, não real");
    return {
      ...(await createPixChargeMock(input)),
      provider: "mock",
      routingMode: "plataforma",
    };
  }

  throw new Error(
    "Adquirente não configurada. Em Admin → Adquirentes defina a principal (#1) e salve " +
      "credenciais: Velana (pk_ + sk_) e/ou PodPay (sk_live_/sk_test_)."
  );
}

async function createPixChargeMock(input: CreateChargeInput): Promise<PaymentCharge> {
  const store = getStore();
  const chargeId = shortId();
  const expires = new Date(Date.now() + (input.expiresInMinutes ?? 30) * 60_000);
  const pix = await mockPixPayload(chargeId, input.amount);

  const charge: PaymentCharge = {
    id: chargeId,
    sellerId: input.sellerId,
    amount: Math.round(input.amount * 100) / 100,
    currency: "BRL",
    status: "waiting_payment",
    method: "PIX",
    description: input.description,
    customerName: input.customerName,
    customerDocument: input.customerDocument,
    metadata: input.metadata,
    pixCopyPaste: pix.pixCopyPaste,
    pixQrCode: pix.pixQrCode,
    expiresAt: expires.toISOString(),
    createdAt: new Date().toISOString(),
  };

  store.charges.unshift(charge);

  const pendingTx: Transaction = {
    id: txId(),
    date: charge.createdAt,
    sellerId: input.sellerId,
    kind: "venda",
    direction: "entrada",
    description: input.description || "Cobrança PIX",
    method: "PIX",
    amount: charge.amount,
    status: "pendente",
    customer: input.customerName,
    product: input.description,
  };
  charge.transactionId = pendingTx.id;
  store.transactions.unshift(pendingTx);
  adjustBalance(input.sellerId, { pending: charge.amount });

  return charge;
}

export async function markChargePaid(chargeId: string): Promise<PaymentCharge> {
  const store = getStore();
  const charge = store.charges.find((c) => c.id === chargeId);
  if (!charge) throw new Error("Cobrança não encontrada");
  if (charge.status === "paid") return charge;
  if (charge.status !== "waiting_payment") {
    throw new Error(`Não é possível pagar cobrança com status ${charge.status}`);
  }

  charge.status = "paid";
  charge.paidAt = new Date().toISOString();

  // mock path: mesma regra PIX (≤50 = R$1; >50 = 3%)
  let fee = round2(
    charge.amount <= 50 ? 1 : (charge.amount * 3) / 100
  );
  try {
    const { computeSaleFeeAmount } = await import("@/lib/server/seller-fees");
    fee = computeSaleFeeAmount(charge.amount);
  } catch {
    /* fallback acima */
  }
  const net = Math.max(0, round2(charge.amount - fee));

  adjustBalance(charge.sellerId, {
    pending: -charge.amount,
    available: net,
  });

  if (charge.transactionId) {
    const tx = store.transactions.find((t) => t.id === charge.transactionId);
    if (tx) {
      tx.status = "aprovada";
      tx.date = charge.paidAt;
    }
  }

  return charge;
}

export function cancelCharge(chargeId: string): PaymentCharge {
  const store = getStore();
  const charge = store.charges.find((c) => c.id === chargeId);
  if (!charge) throw new Error("Cobrança não encontrada");
  if (charge.status !== "waiting_payment") {
    throw new Error("Só cobranças aguardando pagamento podem ser canceladas");
  }
  charge.status = "cancelled";
  if (charge.transactionId) {
    const tx = store.transactions.find((t) => t.id === charge.transactionId);
    if (tx) tx.status = "recusada";
  }
  adjustBalance(charge.sellerId, { pending: -charge.amount });
  return charge;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export { isPodPayEnabledServer, isVelanaEnabledServer };
