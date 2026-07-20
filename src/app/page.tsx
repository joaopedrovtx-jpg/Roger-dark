import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getSessionUser } from "@/lib/server/auth";

/**
 * Home `/` = painel do seller.
 * Conta admin deve ficar no painel admin não cair na dash de usuário.
 */
export default async function DashboardPage() {
  const user = await getSessionUser();
  // Super-admin e gerentes vão direto pro painel Admin
  if (
    user?.roles.includes("admin") ||
    user?.roles.includes("manager")
  ) {
    redirect("/admin");
  }

  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}
