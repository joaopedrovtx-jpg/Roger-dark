"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { KpiGrid } from "./KpiGrid";
import { MetricsStack } from "./MetricsStack";
import { PromoBanner } from "./PromoBanner";
import { RevenueChart } from "./RevenueChart";
import type { PeriodValue } from "./PeriodFilter";
import type { DashboardData } from "@/types/dashboard";
import { authedFetch } from "@/lib/client/session";

const DEFAULT_PERIOD: PeriodValue = {
  key: "7d",
  label: "Últimos 7 dias",
};

/** Painel real: zeros até a API devolver vendas/saldos do banco */
function emptyDashboard(name = "—"): DashboardData {
  return {
    user: { name, avatarUrl: null },
    volume: { current: 0, goal: 1000 },
    balances: { available: 0, pending: 0, held: 0 },
    metrics: {
      netProfit: 0,
      totalTransactions: 0,
      averageTicket: 0,
      totalOutflows: 0,
    },
    conversion: { pix: 0, boleto: 0, card: 0 },
    revenueHistory: [],
  };
}

function mapApiToDashboard(json: Record<string, unknown>): DashboardData {
  const bal = json.balances as DashboardData["balances"] | undefined;
  const metrics = json.metrics as
    | {
        netProfit?: number;
        transactionCount?: number;
        averageTicket?: number;
        totalOut?: number;
      }
    | undefined;
  const user = json.user as DashboardData["user"] | undefined;
  const history = json.revenueHistory as
    | DashboardData["revenueHistory"]
    | undefined;
  const volumeGoal = json.volumeGoal as
    | { current?: number; target?: number }
    | undefined;
  const conversionRate = Number(json.conversionRate) || 0;

  return {
    user: {
      name: user?.name ?? "—",
      avatarUrl: user?.avatarUrl ?? null,
    },
    balances: {
      available: Number(bal?.available) || 0,
      pending: Number(bal?.pending) || 0,
      held: Number(bal?.held) || 0,
    },
    metrics: {
      netProfit: Number(metrics?.netProfit) || 0,
      totalTransactions: Number(metrics?.transactionCount) || 0,
      averageTicket: Number(metrics?.averageTicket) || 0,
      totalOutflows: Number(metrics?.totalOut) || 0,
    },
    revenueHistory: history ?? [],
    volume: {
      current: Number(volumeGoal?.current) || 0,
      goal: Number(volumeGoal?.target) || 1000,
    },
    conversion: {
      pix: conversionRate,
      boleto: 0,
      card: 0,
    },
  };
}

export function DashboardView() {
  const [period, setPeriod] = useState<PeriodValue>(DEFAULT_PERIOD);
  const [data, setData] = useState<DashboardData>(() => emptyDashboard());
  const [source, setSource] = useState<"mysql" | "live" | "error">("live");

  useEffect(() => {
    let cancelled = false;
    setData((prev) => emptyDashboard(prev.user.name));

    (async () => {
      try {
        const res = await authedFetch(
          `/api/v1/dashboard?period=${encodeURIComponent(period.key)}`
        );
        if (!res.ok) {
          if (!cancelled) setSource("error");
          return;
        }
        const json = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        setData(mapApiToDashboard(json));
        setSource(json.source === "mysql" ? "mysql" : "live");
      } catch {
        if (!cancelled) setSource("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [period.key]);

  return (
    <div
      className="flex min-w-0 w-full flex-col"
      style={{
        padding: "14px 20px 24px 12px",
        gap: "var(--main-gap)",
      }}
    >
      <PageHeader name={data.user.name} avatarUrl={data.user.avatarUrl} />

      <PromoBanner />

      {/* Saldos — 3 cards (disponível | pendente | retido) + Sacar */}
      <KpiGrid data={data} />

      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "var(--kpi-gap)",
          alignItems: "stretch",
        }}
      >
        <div
          className="min-w-0"
          style={{
            gridColumn: "1 / 3",
            height: 360,
          }}
        >
          <RevenueChart
            data={data.revenueHistory}
            period={period}
            onPeriodChange={setPeriod}
          />
        </div>

        <div className="min-w-0" style={{ gridColumn: "3 / 4", height: 360 }}>
          <MetricsStack data={data} />
        </div>
      </div>

      {source === "mysql" || source === "live" ? (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: "var(--text-3)",
          }}
        >
          Dados reais (vendas via pagamentos / PodPay)
        </p>
      ) : null}
    </div>
  );
}

export type { PeriodValue };
