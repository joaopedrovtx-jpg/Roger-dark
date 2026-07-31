"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getEmailNotificationPrefs,
  updateEmailNotificationPrefs,
} from "@/lib/actions/notifications.actions";

export interface EmailNotificationPrefs {
  emailOnSale: boolean;
  emailOnWithdrawal: boolean;
  emailOnDocReview: boolean;
}

/** Preferências de notificação por e-mail (usa Server Action). */
export function useEmailNotificationPrefs() {
  return useQuery<EmailNotificationPrefs | null>({
    queryKey: ["email-notification-prefs"],
    queryFn: () => getEmailNotificationPrefs(),
    staleTime: 60 * 1000,
  });
}

export function useUpdateEmailNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation<EmailNotificationPrefs, Error, Partial<EmailNotificationPrefs>>({
    mutationFn: (input) => updateEmailNotificationPrefs(input),
    onSuccess: (data) => {
      qc.setQueryData(["email-notification-prefs"], data);
    },
  });
}