import { AdminShell } from "@/components/admin/AdminShell";
import { AdminUsuariosView } from "@/components/admin/AdminUsuariosView";

export default function AdminUsuariosPage() {
  return (
    <AdminShell title="Usuários">
      <AdminUsuariosView />
    </AdminShell>
  );
}
