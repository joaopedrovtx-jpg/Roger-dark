"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";
import { ActiveGreenAccent } from "./ActiveGreenAccent";

interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  iconSrc?: string;
}

const NAV: NavItem[] = [
  {
    label: "Dashboard",
    // /dash funciona para seller e para admin (home `/` redireciona admin → /admin)
    href: "/dash",
    iconSrc: "/icons/casa.png",
  },
  { label: "Transações", href: "/transacoes", icon: ArrowLeftRight },
  {
    label: "Financeiro",
    href: "/financeiro",
    iconSrc: "/icons/comprovante.png",
  },
  {
    label: "Taxas",
    href: "/financeiro/taxas",
    iconSrc: "/icons/desconto-porcentagem.png",
  },
  {
    label: "Integrações",
    href: "/integracoes",
    // Flaticon #7082705 — integração do sistema
    // https://www.flaticon.com/br/icone-gratis/integracao-do-sistema_7082705
    iconSrc: "/icons/integracao.png",
  },
];

const FILTER_MUTED =
  "brightness(0) saturate(100%) invert(62%) sepia(8%) saturate(400%) hue-rotate(182deg) brightness(0.95)";

const FILTER_ACTIVE_GREEN = "brightness(0) saturate(100%) invert(1)";

const ACTIVE_GREEN = "var(--green-use)";

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
        filter: active ? FILTER_ACTIVE_GREEN : FILTER_MUTED,
        display: "block",
      }}
    />
  );
}

function isActive(href: string, pathname: string): boolean {
  if (href === "/dash" || href === "/") {
    return pathname === "/dash" || pathname === "/";
  }
  if (href === "/financeiro") return pathname === "/financeiro";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex flex-col z-20 h-full min-h-screen"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--bg-sidebar)",
        padding: "14px 14px 16px",
      }}
      aria-label="Navegação principal"
    >
      <div className="mb-4 px-1" style={{ minHeight: 44 }}>
        <BrandLogo />
      </div>

      <nav className="flex flex-col gap-0.5">
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
                // fundo = mesma cor do card do gráfico (--bg-card)
                background: active ? "var(--bg-card)" : "transparent",
                color: active ? ACTIVE_GREEN : "#c4cad6",
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

              <span
                className="relative z-[1] flex min-w-0 flex-1 items-center gap-2.5"
              >
                {item.iconSrc ? (
                  <NavImgIcon src={item.iconSrc} active={active} />
                ) : Icon ? (
                  <Icon
                    size={18}
                    strokeWidth={1.75}
                    style={{
                      color: active ? ACTIVE_GREEN : "var(--icon-muted)",
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
