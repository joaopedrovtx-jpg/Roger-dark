"use client";

import { useState, type ReactNode } from "react";
import { KpiCard } from "./KpiCard";
import {
  IconDolarSymbol,
  IconClockFilled,
  IconLockFilled,
} from "./KpiIcons";
import { formatBRL } from "@/lib/format";
import type { DashboardData } from "@/types/dashboard";
import { SaqueModal } from "@/components/financeiro/SaqueModal";

interface KpiGridProps {
  data: DashboardData;
}

const ICON = 24;

function WithdrawButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90 whitespace-nowrap"
      style={{
        height: 32,
        minWidth: 72,
        padding: "0 16px",
        fontSize: 12,
        border: "none",
        borderRadius: "10px",
        color: "var(--on-green)",
        background: "var(--green-use)",
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      Sacar
    </button>
  );
}

/** Linha de cima: disponível | pendente | retido (3 colunas iguais) */
export function KpiGrid({ data }: KpiGridProps) {
  const [saqueOpen, setSaqueOpen] = useState(false);

  const items: Array<{
    key: string;
    icon: ReactNode;
    label: string;
    value: string;
    action?: ReactNode;
  }> = [
    {
      key: "available",
      icon: <IconDolarSymbol size={ICON} />,
      label: "Saldo disponível",
      value: formatBRL(data.balances.available),
      action: <WithdrawButton onClick={() => setSaqueOpen(true)} />,
    },
    {
      key: "pending",
      icon: <IconClockFilled size={ICON} />,
      label: "Saldo pendente",
      value: formatBRL(data.balances.pending),
    },
    {
      key: "held",
      icon: <IconLockFilled size={ICON} />,
      label: "Saldo retido",
      value: formatBRL(data.balances.held),
    },
  ];

  return (
    <>
      <SaqueModal
        open={saqueOpen}
        onClose={() => setSaqueOpen(false)}
        available={data.balances.available}
      />

      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
        }}
      >
        {items.map((item) => (
          <KpiCard
            key={item.key}
            icon={item.icon}
            label={item.label}
            value={item.value}
            action={item.action}
          />
        ))}
      </div>
    </>
  );
}
