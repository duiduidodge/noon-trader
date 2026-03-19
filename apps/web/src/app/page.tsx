import Link from 'next/link';
import { PanelShell } from '@/components/panel-shell';
import { SignalPulseStrip } from '@/components/signal-pulse-strip';
import { TradeSetupsPanel } from '@/components/trade-setups-panel';
import { PricesColumn } from '@/components/prices-column';
import { Activity, BarChart3, Bot, TestTube2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  return (
    <div className="min-h-[100dvh] lg:h-[100dvh] lg:overflow-hidden bg-background">
      <main id="trading-main" className="mx-auto flex h-full w-full max-w-[1640px] flex-col px-3 pb-2 pt-2 md:px-unit-4 md:pb-3 lg:px-unit-4">
        <div className="flex flex-col gap-unit-3 lg:grid lg:h-[calc(100dvh-112px)] lg:grid-cols-[300px_minmax(0,1fr)_360px] lg:gap-unit-3">
          <div className="flex flex-col lg:min-h-0">
            <PanelShell variant="secondary" className="flex-1 flex flex-col">
              <div className="flex-1 px-unit-3 pb-unit-3 pt-unit-2">
                <PricesColumn />
              </div>
            </PanelShell>
          </div>

          <div className="flex flex-col gap-unit-3 lg:min-h-0">
            <PanelShell variant="primary" className="shrink-0 overflow-hidden">
              <div className="border-b border-border/25 px-4 py-4">
                <p className="font-mono-data text-[10px] uppercase tracking-[0.24em] text-primary/80">Standalone Trading Workspace</p>
                <h1 className="mt-2 font-display text-[30px] font-bold tracking-tight text-foreground">Noon Trader</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Signals, live charts, paper trading, and Hyperliquid-focused backtests, separated from the news feed workflow.
                </p>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                <DashboardLink href="/signals" icon={<Activity className="h-4 w-4" />} title="Signal Intelligence" description="Deep opportunity, emerging mover, and whale flows." />
                <DashboardLink href="/charts" icon={<BarChart3 className="h-4 w-4" />} title="Live Charts" description="Streaming order book, funding, OI, and trade tape." />
                <DashboardLink href="/paper" icon={<Bot className="h-4 w-4" />} title="Paper Bot State" description="Current account, open positions, and recent trade history." />
                <DashboardLink href="/backtests" icon={<TestTube2 className="h-4 w-4" />} title="Backtest Reports" description="Hyperliquid-style 7d, 30d, 60d, and 90d strategy runs." />
              </div>
            </PanelShell>

            <div className="shrink-0">
              <SignalPulseStrip />
            </div>
          </div>

          <div className="flex flex-col gap-unit-3 lg:overflow-hidden">
            <PanelShell variant="secondary" className="overflow-hidden">
              <TradeSetupsPanel />
            </PanelShell>
          </div>
        </div>
      </main>
    </div>
  );
}

function DashboardLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border/30 bg-card/40 p-4 transition-all duration-fast hover:border-primary/35 hover:bg-surface/40"
    >
      <div className="flex items-center gap-2 text-primary">{icon}<span className="font-mono-data text-[10px] uppercase tracking-[0.22em]">Open</span></div>
      <h2 className="mt-3 font-display text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}
