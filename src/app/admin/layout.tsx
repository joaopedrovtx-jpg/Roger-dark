import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { isStaff } from "@/lib/staff";

/**
 * Proteção server-side do painel admin.
 * Super-admin (admin) ou gerente (manager).
 * Permissões por página: AdminShell + APIs.
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

  if (!isStaff(user)) {
    redirect("/?error=admin_required");
  }

  return <>{children}</>;
}
