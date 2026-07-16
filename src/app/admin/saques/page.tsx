import { AdminShell } from "@/components/admin/AdminShell";
import { AdminSaquesView } from "@/components/admin/AdminSaquesView";

export default function AdminSaquesPage() {
  return (
    <AdminShell title="Saques">
      <AdminSaquesView />
    </AdminShell>
  );
}
