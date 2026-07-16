import { AppShell } from "@/components/layout/AppShell";
import { CadastroContaView } from "@/components/configuracoes/CadastroContaView";

export default function MeusDocumentosPage() {
  return (
    <AppShell>
      <CadastroContaView initialTab="documentos" />
    </AppShell>
  );
}
