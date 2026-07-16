import { AdminShell } from "@/components/admin/AdminShell";
import { AdminDashboardView } from "@/components/admin/AdminDashboardView";

export default function AdminDashboardPage() {
  return (
    <AdminShell title="Dashboard">
      <AdminDashboardView />
    </AdminShell>
  );
}
