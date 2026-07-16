import { Sidebar } from "@/components/layout/Sidebar";
import { DashboardView } from "@/components/dashboard/DashboardView";

export default function DashboardPage() {
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
