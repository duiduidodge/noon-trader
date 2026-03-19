'use client';

import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCompactNumber, formatPercent } from '@/lib/utils';

interface GlobalStats {
  totalMcap: number;
  totalVolume: number;
  btcDominance: number;
  avgChange24h: number;
}

export function MarketSignals() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['prices'],
    queryFn: async () => {
      const res = await fetch('/api/prices');
      if (!res.ok) throw new Error('Failed to fetch prices');
      return res.json();
    },
    refetchInterval: 60_000,
    select: (json) => json.global as GlobalStats,
  });

  if (error) return null;

  return (
    <section className="glass rounded-lg overflow-hidden">
      <div className="h-[1px] bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      <div className="px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold tracking-wide text-foreground uppercase">
            Market Signals
          </h2>
          <span className="font-mono-data text-[9px] uppercase tracking-wider text-muted-foreground/50">
            60s refresh
          </span>
        </div>

        {isLoading || !data ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-accent/50" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <SignalCard label="Total MCap" value={formatCompactNumber(data.totalMcap)} />
            <SignalCard label="24h Volume" value={formatCompactNumber(data.totalVolume)} />
            <SignalCard label="BTC Dominance" value={`${data.btcDominance.toFixed(1)}%`} />
            <SignalCard
              label="24h Breadth"
              value={formatPercent(data.avgChange24h)}
              tone={data.avgChange24h >= 0 ? 'bullish' : 'bearish'}
              icon={data.avgChange24h >= 0 ? TrendingUp : TrendingDown}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function SignalCard({
  label,
  value,
  tone = 'neutral',
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'bullish' | 'bearish';
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-surface/40 px-3 py-2.5">
      <span className="mb-1 block font-mono-data text-[9px] uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      <div
        className={clsx(
          'flex items-center gap-1 font-mono-data text-xs font-semibold',
          tone === 'bullish' && 'text-bullish',
          tone === 'bearish' && 'text-bearish',
          tone === 'neutral' && 'text-foreground'
        )}
      >
        {Icon ? <Icon className="h-3 w-3" /> : null}
        <span>{value}</span>
      </div>
    </div>
  );
}
