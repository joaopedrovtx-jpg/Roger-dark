import { AppShell } from "@/components/layout/AppShell";
import { FinanceiroOverview } from "@/components/financeiro/FinanceiroOverview";

export default function FinanceiroPage() {
  return (
    <AppShell>
      <FinanceiroOverview />
    </AppShell>
  );
}
