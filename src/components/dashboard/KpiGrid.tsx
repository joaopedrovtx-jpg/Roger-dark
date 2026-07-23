"use client";

import { useEffect, useState, type ReactNode } from "react";
import { KpiCard } from "./KpiCard";
import {
  IconDolarSymbol,
  IconClockFilled,
  IconLockFilled,
} from "./KpiIcons";
import { formatBRL } from "@/lib/format";
import type { DashboardData } from "@/types/dashboard";
import { SaqueModal } from "@/components/financeiro/SaqueModal";
import { isImpersonating } from "@/lib/client/impersonate";

interface KpiGridProps {
  data: DashboardData;
  /** Após saque bem-sucedido — recarrega dashboard */
  onBalancesRefresh?: () => void;
  feePercent?: number;
  feeFixed?: number;
}

const ICON = 22;

function WithdrawButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center font-semibold transition-opacity hover:opacity-90 whitespace-nowrap"
      style={{
        height: 30,
        minWidth: 68,
        padding: "0 14px",
        fontSize: 12,
        border: "none",
        borderRadius: "10px",
        color: "var(--on-green)",
        background: "var(--green-use)",
        lineHeight: 1,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
      title={
        disabled
          ? "Modo visualização: saque não permitido"
          : undefined
      }
    >
      Sacar
    </button>
  );
}

/**
 * 3 saldos com a mesma altura e largura (grid 3 colunas iguais).
 */
export function KpiGrid({
  data,
  onBalancesRefresh,
  feePercent = 3,
  feeFixed = 0,
}: KpiGridProps) {
  const [saqueOpen, setSaqueOpen] = useState(false);
  const [viewOnly, setViewOnly] = useState(false);

  useEffect(() => {
    setViewOnly(isImpersonating());
    function sync() {
      setViewOnly(isImpersonating());
    }
    window.addEventListener("darkpay:impersonate", sync);
    return () => window.removeEventListener("darkpay:impersonate", sync);
  }, []);

  const availableAction: ReactNode = viewOnly ? (
    <WithdrawButton onClick={() => undefined} disabled />
  ) : (
    <WithdrawButton onClick={() => setSaqueOpen(true)} />
  );

  return (
    <>
      {!viewOnly ? (
        <SaqueModal
          open={saqueOpen}
          onClose={() => setSaqueOpen(false)}
          available={data.balances.available}
          feePercent={feePercent}
          feeFixed={feeFixed}
          onSuccess={() => onBalancesRefresh?.()}
        />
      ) : null}

      {/*
        Desktop: disponível+pendente mais estreitos (área do gráfico);
        retido mais largo = mesma largura da coluna das 4 métricas.
      */}
      <div className="dash-balances">
        <KpiCard
          icon={<IconDolarSymbol size={ICON} />}
          label="Saldo disponível"
          value={formatBRL(data.balances.available)}
          action={availableAction}
          reserveAction
        />
        <KpiCard
          icon={<IconClockFilled size={ICON} />}
          label="Saldo pendente"
          value={formatBRL(data.balances.pending)}
          reserveAction
        />
        <KpiCard
          icon={<IconLockFilled size={ICON} />}
          label="Saldo retido"
          value={formatBRL(data.balances.held)}
        />
      </div>
    </>
  );
}
