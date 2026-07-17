import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";

/**
 * Proteção server-side do painel admin.
 * Seller logado NÃO entra em /admin só digitando a URL — precisa role admin.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  if (!user.roles.includes("admin")) {
    // Conta de seller/usuário comum: volta pro painel seller
    redirect("/?error=admin_required");
  }

  return <>{children}</>;
}
