import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { isStaff, permissionForAdminPath, hasStaffPermission } from "@/lib/staff";
import { headers } from "next/headers";

/**
 * Proteção server-side do painel admin.
 * Super-admin (admin) ou gerente (manager).
 * Gerentes: redireciona se não têm permissão para a página atual.
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

  const hdrs = await headers();
  const pathname = hdrs.get("x-pathname") || "";
  const required = permissionForAdminPath(pathname);
  if (required && !hasStaffPermission(user, required)) {
    redirect("/admin");
  }

  return <>{children}</>;
}
