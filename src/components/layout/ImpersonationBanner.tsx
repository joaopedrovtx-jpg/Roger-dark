"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  clearImpersonateSeller,
  getImpersonateSeller,
  type ImpersonateSeller,
} from "@/lib/client/impersonate";

/**
 * Faixa no topo quando staff visualiza a conta de um seller (prova social).
 * Só leitura — saque e ações de escrita bloqueados.
 */
export function ImpersonationBanner() {
  const router = useRouter();
  const [target, setTarget] = useState<ImpersonateSeller | null>(null);

  useEffect(() => {
    function sync() {
      setTarget(getImpersonateSeller());
    }
    sync();
    window.addEventListener("darkpay:impersonate", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("darkpay:impersonate", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!target) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 flex-wrap"
      style={{
        marginBottom: 12,
        padding: "10px 14px",
        borderRadius: "var(--radius-md)",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid var(--border-card)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          color: "var(--text-1)",
          lineHeight: 1.4,
        }}
      >
        Visualizando como{" "}
        <span style={{ color: "#ffffff" }}>{target.name}</span>
        <span
          style={{
            fontWeight: 500,
            color: "var(--text-3)",
            marginLeft: 8,
          }}
        >
          · somente leitura (sem saque)
        </span>
      </p>
      <button
        type="button"
        onClick={() => {
          clearImpersonateSeller();
          setTarget(null);
          router.push("/admin/usuarios");
        }}
        className="inline-flex items-center font-semibold shrink-0 transition-opacity hover:opacity-90"
        style={{
          height: 32,
          padding: "0 12px",
          borderRadius: "var(--radius-md)",
          border: "none",
          background: "#ffffff",
          color: "#0a0f0c",
          fontSize: 12.5,
          cursor: "pointer",
        }}
      >
        Sair da visualização
      </button>
    </div>
  );
}
