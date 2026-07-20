import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = {
  title: "Criar conta Dark Pay",
  description: "Crie sua conta na Dark Pay",
};

export default function RegistroPage() {
  return (
    <AuthShell>
      <RegisterForm />
    </AuthShell>
  );
}
