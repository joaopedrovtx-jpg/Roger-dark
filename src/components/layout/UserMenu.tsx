"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

interface UserMenuProps {
  name: string;
  avatarUrl?: string | null;
}

const MENU_LINKS = [
  { label: "Perfil", href: "/configuracoes/perfil" },
  { label: "Notificações", href: "/configuracoes/notificacoes" },
  { label: "Configuração", href: "/configuracoes" },
  { label: "Documentação de API", href: "/docs" },
  { label: "Meus documentos", href: "/configuracoes/documentos" },
  { label: "Painel Admin", href: "/admin" },
] as const;

export function UserMenu({ name, avatarUrl }: UserMenuProps) {
  const router = useRouter();
  const { logout, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent | TouchEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setOpen(false);
    try {
      await logout();
    } catch {
      /* limpa cookie no servidor mesmo se falhar */
    }
    // hard navigate garante cookie limpo + middleware
    window.location.href = "/login";
  }

  const links = MENU_LINKS.filter((item) =>
    item.href === "/admin" ? isAdmin : true
  );

  const avatar = (
    <span
      className="relative flex items-center justify-center overflow-hidden text-[11px] font-semibold shrink-0"
      style={{
        width: "var(--avatar-size)",
        height: "var(--avatar-size)",
        borderRadius: "var(--radius-full)",
        background: "var(--bg-elevated)",
        color: "var(--green-use)",
        boxShadow: "0 0 0 1px var(--border-muted)",
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="flex items-center gap-2 px-1.5 py-1 transition-colors hover:bg-white/[0.03] max-w-[min(100vw-48px,280px)]"
        style={{ borderRadius: "var(--radius-md)" }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {avatar}
        <span
          className="text-[13px] font-medium truncate hidden sm:inline"
          style={{ color: "#e8eaed", maxWidth: 140 }}
        >
          {name}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className="shrink-0 transition-transform duration-150"
          style={{
            color: "var(--text-3)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Menu do usuário"
          className="absolute right-0 z-50 mt-2 overflow-hidden"
          style={{
            minWidth: 200,
            width: "max-content",
            maxWidth: "min(260px, calc(100vw - 24px))",
            background: "var(--bg-card)",
            border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
          }}
        >
          <div
            className="flex items-center gap-2.5 px-3 py-3"
            style={{ borderBottom: "1px solid var(--border-card)" }}
          >
            {avatar}
            <span
              className="text-[13px] font-semibold truncate"
              style={{ color: "var(--text-1)", maxWidth: 160 }}
            >
              {name}
            </span>
          </div>

          {links.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              role="menuitem"
              className="flex items-center px-3 text-[13px] font-medium transition-colors"
              style={{
                height: 40,
                color: "var(--text-2)",
                textDecoration: "none",
              }}
              onClick={() => setOpen(false)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                e.currentTarget.style.color = "var(--text-1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-2)";
              }}
            >
              {item.label}
            </Link>
          ))}

          <div style={{ height: 1, background: "var(--border-card)" }} />

          <button
            type="button"
            role="menuitem"
            disabled={loggingOut}
            className="flex w-full items-center px-3 text-[13px] font-medium transition-colors text-left"
            style={{
              height: 40,
              color: "#f87171",
              background: "transparent",
              border: "none",
              cursor: loggingOut ? "wait" : "pointer",
              opacity: loggingOut ? 0.7 : 1,
            }}
            onClick={() => void handleLogout()}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239,68,68,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {loggingOut ? "Saindo…" : "Deslogar"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
