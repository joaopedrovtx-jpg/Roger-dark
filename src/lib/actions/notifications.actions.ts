"use server";

import { getSessionUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export async function getEmailNotificationPrefs() {
  const user = await getSessionUser();
  if (!user) return null;

  const prefs = await prisma.notificationSetting.findUnique({
    where: { userId: user.id },
  });
  if (!prefs) return null;

  return {
    emailOnSale: prefs.emailOnSale,
    emailOnWithdrawal: prefs.emailOnWithdrawal,
    emailOnDocReview: prefs.emailOnDocReview,
  };
}

export async function updateEmailNotificationPrefs(data: {
  emailOnSale?: boolean;
  emailOnWithdrawal?: boolean;
  emailOnDocReview?: boolean;
}) {
  const user = await getSessionUser();
  if (!user) throw new Error("Não autenticado");

  const updated = await prisma.notificationSetting.upsert({
    where: { userId: user.id },
    update: {
      ...(data.emailOnSale !== undefined && { emailOnSale: data.emailOnSale }),
      ...(data.emailOnWithdrawal !== undefined && { emailOnWithdrawal: data.emailOnWithdrawal }),
      ...(data.emailOnDocReview !== undefined && { emailOnDocReview: data.emailOnDocReview }),
    },
    create: {
      userId: user.id,
      emailOnSale: data.emailOnSale ?? false,
      emailOnWithdrawal: data.emailOnWithdrawal ?? true,
      emailOnDocReview: data.emailOnDocReview ?? true,
    },
  });

  return {
    emailOnSale: updated.emailOnSale,
    emailOnWithdrawal: updated.emailOnWithdrawal,
    emailOnDocReview: updated.emailOnDocReview,
  };
}
