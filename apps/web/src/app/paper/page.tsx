'use client';

import { useQuery } from '@tanstack/react-query';
import { PanelShell } from '@/components/panel-shell';

interface PaperAccount {
  equity: number;
  totalPnlUsd: number;
  totalFeesUsd: number;
  totalFundingUsd: number;
  drawdownPct: number;
}

interface PaperPositionView {
  id: string;
  asset: string;
  direction: string;
  entryPrice: number;
  unrealisedPnl?: number;
  regime?: string | null;
}

interface PaperTradeView {
  id: string;
  asset: string;
  direction: string;
  exitReason?: string | null;
  realisedPnl?: number;
  entryFeeUsd?: number;
  exitFeeUsd?: number;
}

interface PaperStateResponse {
  generatedAt: string;
  state: {
    account?: PaperAccount | null;
    openPositions?: PaperPositionView[];
    recentTrades?: PaperTradeView[];
  } | null;
}

async function fetchPaperState() {
  const res = await fetch('/api/paper/state');
  if (!res.ok) throw new Error('Failed to fetch paper state');
  return res.json() as Promise<PaperStateResponse>;
}

export default function PaperPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['paper-state'],
    queryFn: fetchPaperState,
    refetchInterval: 30_000,
  });

  const state = data?.state;
  const account = state?.account;
  const openPositions = state?.openPositions ?? [];
  const recentTrades = state?.recentTrades ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[1640px] flex-col gap-3 px-3 py-3 md:px-4">
      <PanelShell variant="primary" className="overflow-hidden">
        <div className="border-b border-border/20 px-4 py-4">
          <p className="font-mono-data text-[10px] uppercase tracking-[0.24em] text-primary/80">Paper Trading</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-foreground">Bot State</h1>
        </div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading paper state…</div>
        ) : isError || !account ? (
          <div className="p-4 text-sm text-bearish">Paper trading state unavailable.</div>
        ) : (
          <div className="grid gap-3 p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-3">
              <MetricCard label="Equity" value={`$${Number(account.equity ?? 0).toFixed(2)}`} />
              <MetricCard label="Total P&L" value={`$${Number(account.totalPnlUsd ?? 0).toFixed(2)}`} />
              <MetricCard label="Fees" value={`$${Number(account.totalFeesUsd ?? 0).toFixed(2)}`} />
              <MetricCard label="Funding" value={`$${Number(account.totalFundingUsd ?? 0).toFixed(2)}`} />
              <MetricCard label="Drawdown" value={`${Number(account.drawdownPct ?? 0).toFixed(2)}%`} />
            </div>
            <div className="grid gap-3">
              <Section title={`Open Positions (${openPositions.length})`}>
                {openPositions.length === 0 ? <EmptyState text="No open positions." /> : openPositions.map((pos) => (
                  <Row key={pos.id} title={`${pos.asset} ${pos.direction}`} detail={`Entry $${Number(pos.entryPrice).toFixed(2)} · P&L $${Number(pos.unrealisedPnl ?? 0).toFixed(2)} · ${pos.regime ?? '—'}`} />
                ))}
              </Section>
              <Section title={`Recent Trades (${recentTrades.length})`}>
                {recentTrades.length === 0 ? <EmptyState text="No recent trades." /> : recentTrades.slice().reverse().slice(0, 12).map((trade) => (
                  <Row key={trade.id} title={`${trade.asset} ${trade.direction}`} detail={`${trade.exitReason ?? '—'} · Net $${Number(trade.realisedPnl ?? 0).toFixed(2)} · Fees $${(Number(trade.entryFeeUsd ?? 0) + Number(trade.exitFeeUsd ?? 0)).toFixed(2)}`} />
                ))}
              </Section>
            </div>
          </div>
        )}
      </PanelShell>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/25 bg-card/45 p-4">
      <div className="font-mono-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/25 bg-card/35">
      <div className="border-b border-border/20 px-4 py-3 font-mono-data text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{title}</div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border/20 bg-surface/20 px-3 py-2">
      <div className="font-mono-data text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-3 py-4 text-sm text-muted-foreground">{text}</div>;
}
