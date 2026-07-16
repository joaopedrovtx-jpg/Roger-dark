import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Criar nova senha — Dark Pay",
  description: "Defina uma nova senha para sua conta Dark Pay",
};

export default function RedefinirSenhaPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div
            style={{
              color: "var(--text-2)",
              fontSize: 14,
              textAlign: "center",
            }}
          >
            Carregando…
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
