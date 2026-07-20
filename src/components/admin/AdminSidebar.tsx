"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActiveGreenAccent } from "@/components/layout/ActiveGreenAccent";
import { useBranding } from "@/components/branding/BrandingProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  ADMIN_NAV_PERMISSION,
  hasStaffPermission,
  type StaffPermission,
} from "@/lib/staff";

interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  iconSrc?: string;
  permission: StaffPermission;
}

const NAV: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    iconSrc: "/icons/casa.png",
    permission: "dashboard",
  },
  {
    label: "Usuários",
    href: "/admin/usuarios",
    iconSrc: "/icons/usuarios.png",
    permission: "usuarios",
  },
  {
    label: "Gerentes",
    href: "/admin/gerentes",
    iconSrc: "/icons/gerente.png",
    permission: "gerentes",
  },
  {
    label: "Saques",
    href: "/admin/saques",
    iconSrc: "/icons/saque.png",
    permission: "saques",
  },
  {
    label: "Adquirentes",
    href: "/admin/adquirentes",
    iconSrc: "/icons/banco.png",
    permission: "adquirentes",
  },
  {
    label: "Personalização",
    href: "/admin/personalizacao",
    iconSrc: "/icons/editar.png",
    permission: "personalizacao",
  },
];

const FILTER_MUTED =
  "brightness(0) saturate(100%) invert(62%) sepia(8%) saturate(400%) hue-rotate(182deg) brightness(0.95)";

const FILTER_ACTIVE = "brightness(0) saturate(100%) invert(1)";

const ACTIVE = "var(--green-use)";

function NavImgIcon({
  src,
  active,
  size = 18,
}: {
  src: string;
  active: boolean;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      aria-hidden
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        flexShrink: 0,
        filter: active ? FILTER_ACTIVE : FILTER_MUTED,
        display: "block",
      }}
    />
  );
}

function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { branding } = useBranding();
  const { user, isSuperAdmin } = useAuth();

  const navItems = NAV.filter((item) => {
    // Super-admin vê tudo
    if (isSuperAdmin) return true;
    // documentos libera Usuários se tiver só documentos
    if (item.permission === "usuarios") {
      return (
        hasStaffPermission(user, "usuarios") ||
        hasStaffPermission(user, "documentos")
      );
    }
    return hasStaffPermission(user, item.permission);
  });

  const homeHref = navItems[0]?.href ?? "/admin";

  return (
    <aside className="app-sidebar-panel" aria-label="Navegação admin">
      <div className="mb-5 px-1 shrink-0">
        <Link
          href={homeHref}
          onClick={() => onNavigate?.()}
          className="flex items-center select-none"
          style={{ textDecoration: "none" }}
          aria-label="Dark Pay Admin início"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logoUrl}
            alt="Dark Pay"
            height={44}
            style={{
              height: 44,
              width: "auto",
              maxWidth: 220,
              objectFit: "contain",
              objectPosition: "left center",
              display: "block",
            }}
          />
        </Link>
      </div>

      <nav className="flex flex-col gap-0.5 shrink-0">
        {navItems.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() => onNavigate?.()}
              className={cn(
                "group relative flex items-center gap-2.5 text-[13.5px]",
                active ? "font-semibold" : "font-medium"
              )}
              style={{
                minHeight: "var(--nav-item-height)",
                height: "auto",
                paddingTop: 10,
                paddingBottom: 10,
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                background: active ? "var(--bg-card)" : "transparent",
                color: active ? ACTIVE : "#c4cad6",
                paddingLeft: 12,
                paddingRight: 12,
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = active
                  ? "var(--bg-card)"
                  : "transparent";
              }}
            >
              {active ? <ActiveGreenAccent /> : null}

              <span className="relative z-[1] flex min-w-0 flex-1 items-center gap-2.5">
                {item.iconSrc ? (
                  <NavImgIcon src={item.iconSrc} active={active} />
                ) : Icon ? (
                  <Icon
                    size={18}
                    strokeWidth={1.75}
                    style={{
                      color: active ? ACTIVE : "var(--icon-muted)",
                      flexShrink: 0,
                    }}
                  />
                ) : null}
                <span className="flex-1 truncate">{item.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

// re-export for callers that might want the map
void ADMIN_NAV_PERMISSION;
