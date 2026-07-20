import { AppShell } from "@/components/layout/AppShell";
import { DashboardView } from "@/components/dashboard/DashboardView";

/**
 * Dashboard do seller.
 * Staff (admin/gerente) chega aqui via "Dashboard" no modal do usuário
 * em modo visualização (prova social) — só leitura, sem saque.
 * (A home `/` redireciona admin para /admin.)
 */
export default function SellerDashPage() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}
