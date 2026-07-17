import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getSessionUser } from "@/lib/server/auth";

/**
 * Home `/` = painel do seller.
 * Conta admin deve ficar no painel admin — não cair na dash de usuário.
 */
export default async function DashboardPage() {
  const user = await getSessionUser();
  if (user?.roles.includes("admin")) {
    redirect("/admin");
  }

  return (
    <div
      className="min-h-screen grid"
      style={{
        gridTemplateColumns: "var(--sidebar-width) 1fr",
        gridTemplateRows: "1fr",
        background: "var(--bg-app)",
      }}
    >
      <div style={{ gridColumn: 1, gridRow: 1 }}>
        <Sidebar />
      </div>

      <div className="min-w-0" style={{ gridColumn: 2, gridRow: 1 }}>
        <DashboardView />
      </div>
    </div>
  );
}
