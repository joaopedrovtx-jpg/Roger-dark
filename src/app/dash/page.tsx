import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getSessionUser } from "@/lib/server/auth";

export default async function SellerDashPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dash");

  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}
