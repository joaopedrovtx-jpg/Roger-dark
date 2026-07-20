import type { Metadata } from "next";
import { DocsView } from "@/components/docs/DocsView";

export const metadata: Metadata = {
  title: "Documentação da API Dark Pay",
  description:
    "Documentação completa da API Dark Pay: autenticação, cobranças PIX, webhooks e mais.",
};

/** Página dedicada de docs fora do AppShell do painel */
export default function DocsPage() {
  return <DocsView />;
}
