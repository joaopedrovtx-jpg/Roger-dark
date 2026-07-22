"use client";

import { useEffect, useState } from "react";
import { KpiGrid } from "./KpiGrid";
import { MetricsStack } from "./MetricsStack";
import { PromoBanner } from "./PromoBanner";
import { RevenueChart } from "./RevenueChart";
import type { PeriodValue } from "./PeriodFilter";
import type { DashboardData } from "@/types/dashboard";
import { authedFetch } from "@/lib/client/session";
import { fillChartSeries } from "@/lib/chart-series";

const DEFAULT_PERIOD: PeriodValue = {
  key: "7d",
  label: "Últimos 7 dias",
};

/** Painel real: zeros até a API devolver vendas/saldos do banco */
function emptyDashboard(
  name = "-",
  periodKey: PeriodValue["key"] = "7d"
): DashboardData {
  // Série contínua do período selecionado (ex.: 15 pontos em 15d)
  const revenueHistory = fillChartSeries(periodKey, []);
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
    revenueHistory,
  };
}

function mapApiToDashboard(
  json: Record<string, unknown>,
  periodKey: PeriodValue["key"]
): DashboardData {
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
      name: user?.name ?? "-",
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
    // Garante 7/15/… pontos no eixo mesmo se a API vier esparsa
    revenueHistory: fillChartSeries(periodKey, history ?? []),
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
  const [fetchError, setFetchError] = useState(false);
  const [saqueFees, setSaqueFees] = useState({ percent: 3, fixed: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData((prev) => emptyDashboard(prev.user.name, period.key));
    setFetchError(false);

    (async () => {
      try {
        const res = await authedFetch(
          `/api/v1/dashboard?period=${encodeURIComponent(period.key)}`
        );
        if (!res.ok) {
          if (!cancelled) setFetchError(true);
          return;
        }
        const json = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        setData(mapApiToDashboard(json, period.key));
        // taxas de saque (mesmo source do financeiro quando disponível)
        const fees = json.fees as
          | { saquePercent?: number; saqueFixed?: number }
          | undefined;
        if (fees) {
          setSaqueFees({
            percent: Number(fees.saquePercent) || 3,
            fixed: Number(fees.saqueFixed) || 0,
          });
        }
      } catch {
        if (!cancelled) setFetchError(true);
      }
    })();

    // fees do financeiro como fallback
    void (async () => {
      try {
        const res = await authedFetch("/api/v1/finance");
        if (!res.ok || cancelled) return;
        const fin = (await res.json()) as {
          fees?: { saquePercent?: number; saqueFixed?: number };
        };
        if (fin.fees && !cancelled) {
          setSaqueFees({
            percent: Number(fin.fees.saquePercent) || 3,
            fixed: Number(fin.fees.saqueFixed) || 0,
          });
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [period.key, refreshKey]);

  return (
    <div className="flex min-w-0 w-full flex-col stack-gap">
      {fetchError ? (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "rgba(239,68,68,0.12)",
            color: "#ef4444",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Não foi possível carregar os dados do dashboard.
        </div>
      ) : null}
      <PromoBanner />

      {/*
        [ Disponível | Pendente | Retido ]  ← mesma altura e largura (3 iguais)
        [        Gráfico                 ]  [ 4 métricas do topo à base do gráfico ]
      */}
      <div className="dash-seller">
        <div className="dash-seller__balances">
          <KpiGrid
            data={data}
            feePercent={saqueFees.percent}
            feeFixed={saqueFees.fixed}
            onBalancesRefresh={() => setRefreshKey((k) => k + 1)}
          />
        </div>

        <div className="dash-seller__body">
          <div className="dash-seller__chart min-w-0">
            <RevenueChart
              data={data.revenueHistory}
              period={period}
              onPeriodChange={setPeriod}
            />
          </div>
          <div className="dash-seller__metrics min-w-0">
            <MetricsStack data={data} />
          </div>
        </div>
      </div>
    </div>
  );
}

export type { PeriodValue };
