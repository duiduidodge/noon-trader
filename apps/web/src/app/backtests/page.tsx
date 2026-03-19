'use client';

import { useQuery } from '@tanstack/react-query';
import { PanelShell } from '@/components/panel-shell';

interface BacktestReport {
  horizonDays: number;
  totalTrades: number;
  winRate: number;
  netPnlUsd: number;
  grossPnlUsd: number;
  totalFeesUsd: number;
  totalFundingUsd: number;
  maxDrawdownPct: number;
}

interface BacktestsResponse {
  generatedAt: string;
  reports: BacktestReport[];
}

async function fetchBacktests() {
  const res = await fetch('/api/backtests');
  if (!res.ok) throw new Error('Failed to fetch backtests');
  return res.json() as Promise<BacktestsResponse>;
}

export default function BacktestsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['paper-backtests'],
    queryFn: fetchBacktests,
    refetchInterval: 60_000,
  });

  const reports = data?.reports ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-3 px-3 py-3 md:px-4">
      <PanelShell variant="primary" className="overflow-hidden">
        <div className="border-b border-border/20 px-4 py-4">
          <p className="font-mono-data text-[10px] uppercase tracking-[0.24em] text-primary/80">Backtests</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-foreground">Hyperliquid Paper SMC Reports</h1>
        </div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading reports…</div>
        ) : isError ? (
          <div className="p-4 text-sm text-bearish">Backtest reports unavailable.</div>
        ) : reports.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No reports yet. Run `npm run paper:run --workspace @noon-trader/backtest`.</div>
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            {reports.map((report) => (
              <div key={report.horizonDays} className="rounded-2xl border border-border/25 bg-card/45 p-4">
                <div className="font-mono-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{report.horizonDays} Day Window</div>
                <div className="mt-3 space-y-2 text-sm">
                  <Line label="Trades" value={String(report.totalTrades ?? 0)} />
                  <Line label="Win Rate" value={`${Number(report.winRate ?? 0).toFixed(1)}%`} />
                  <Line label="Net P&L" value={`$${Number(report.netPnlUsd ?? 0).toFixed(2)}`} />
                  <Line label="Gross P&L" value={`$${Number(report.grossPnlUsd ?? 0).toFixed(2)}`} />
                  <Line label="Fees" value={`$${Number(report.totalFeesUsd ?? 0).toFixed(2)}`} />
                  <Line label="Funding" value={`$${Number(report.totalFundingUsd ?? 0).toFixed(2)}`} />
                  <Line label="Drawdown" value={`${Number(report.maxDrawdownPct ?? 0).toFixed(1)}%`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </PanelShell>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono-data text-foreground">{value}</span>
    </div>
  );
}
