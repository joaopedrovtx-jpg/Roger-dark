import { AdminShell } from "@/components/admin/AdminShell";
import { AdminGerentesView } from "@/components/admin/AdminGerentesView";

export default function AdminGerentesPage() {
  return (
    <AdminShell title="Gerentes">
      <AdminGerentesView />
    </AdminShell>
  );
}
