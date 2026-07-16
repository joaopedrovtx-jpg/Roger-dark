import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPersonalizacaoView } from "@/components/admin/AdminPersonalizacaoView";

export default function AdminPersonalizacaoPage() {
  return (
    <AdminShell title="Personalização">
      <AdminPersonalizacaoView />
    </AdminShell>
  );
}
