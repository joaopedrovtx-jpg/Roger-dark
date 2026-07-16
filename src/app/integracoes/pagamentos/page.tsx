import { AppShell } from "@/components/layout/AppShell";
import { PagamentosApiView } from "@/components/integracoes/PagamentosApiView";

export default function PagamentosApiPage() {
  return (
    <AppShell>
      <PagamentosApiView />
    </AppShell>
  );
}
