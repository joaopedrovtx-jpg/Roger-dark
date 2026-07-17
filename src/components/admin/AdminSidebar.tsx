"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActiveGreenAccent } from "@/components/layout/ActiveGreenAccent";
import { useBranding } from "@/components/branding/BrandingProvider";

interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  iconSrc?: string;
}

const NAV: NavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    iconSrc: "/icons/casa.png",
  },
  {
    label: "Minha Dash",
    href: "/dash",
    iconSrc: "/icons/usuario-perfil.png",
  },
  {
    label: "Usuários",
    href: "/admin/usuarios",
    iconSrc: "/icons/usuarios.png",
  },
  {
    label: "Gerentes",
    href: "/admin/gerentes",
    // Flaticon #2047262 — CEO
    // https://www.flaticon.com/br/icone-gratis/ceo_2047262
    iconSrc: "/icons/gerente.png",
  },
  {
    label: "Saques",
    href: "/admin/saques",
    // Flaticon #2769213 — retirada de dinheiro
    iconSrc: "/icons/saque.png",
  },
  {
    label: "Adquirentes",
    href: "/admin/adquirentes",
    // Flaticon #1015070 — banco
    // https://www.flaticon.com/br/icone-gratis/banco_1015070
    iconSrc: "/icons/banco.png",
  },
  {
    label: "Personalização",
    href: "/admin/personalizacao",
    iconSrc: "/icons/editar.png",
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
  if (href === "/dash") return pathname === "/dash" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { branding } = useBranding();

  return (
    <aside
      className="flex flex-col z-20 h-full min-h-screen"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--bg-sidebar)",
        padding: "14px 14px 16px",
      }}
      aria-label="Navegação admin"
    >
      <div className="mb-5 px-1 shrink-0">
        <Link
          href="/admin"
          className="flex items-center select-none"
          style={{ textDecoration: "none" }}
          aria-label="Dark Pay Admin — início"
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
        {NAV.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-2.5 text-[13.5px]",
                active ? "font-semibold" : "font-medium"
              )}
              style={{
                height: "var(--nav-item-height)",
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
