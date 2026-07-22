import { prisma } from "@/lib/server/prisma";
import {
  sendSaleNotificationEmail,
  sendWithdrawalEmail,
  sendDocReviewEmail,
} from "@/lib/server/email";

function n(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

export async function notifySaleApproved(sellerId: string, amount: number, customerName?: string) {
  try {
    const [user, prefs] = await Promise.all([
      prisma.user.findUnique({ where: { id: sellerId }, select: { email: true, name: true } }),
      prisma.notificationSetting.findUnique({ where: { userId: sellerId } }),
    ]);
    if (!user?.email) return;
    if (prefs && !prefs.emailOnSale) return;

    await sendSaleNotificationEmail(user.email, user.name || "Vendedor", n(amount), customerName);
  } catch {
    // best-effort
  }
}

export async function notifyWithdrawalStatus(sellerId: string, amount: number, status: string, pixKey?: string) {
  try {
    const [user, prefs] = await Promise.all([
      prisma.user.findUnique({ where: { id: sellerId }, select: { email: true, name: true } }),
      prisma.notificationSetting.findUnique({ where: { userId: sellerId } }),
    ]);
    if (!user?.email) return;
    if (prefs && !prefs.emailOnWithdrawal) return;

    await sendWithdrawalEmail(user.email, user.name || "Vendedor", n(amount), status, pixKey);
  } catch {
    // best-effort
  }
}

export async function notifyDocReview(userId: string, status: string) {
  try {
    const [user, prefs, docs] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } }),
      prisma.notificationSetting.findUnique({ where: { userId } }),
      prisma.document.findMany({ where: { userId }, orderBy: { submittedAt: "desc" }, take: 1, select: { kind: true } }),
    ]);
    if (!user?.email) return;
    if (prefs && !prefs.emailOnDocReview) return;

    const docKind = docs[0]?.kind || "documento";
    await sendDocReviewEmail(user.email, user.name || "Usuário", docKind, status);
  } catch {
    // best-effort
  }
}
