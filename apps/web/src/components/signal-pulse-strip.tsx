'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Activity, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface SetupResponse {
  generatedAt: string;
  whaleTopScore: number | null;
  setups: Array<{
    id: string;
    asset: string;
    direction: string;
    confidence: number;
    thesis: string;
  }>;
}

async function fetchSetups(): Promise<SetupResponse> {
  const res = await fetch('/api/signals/setups');
  if (!res.ok) throw new Error('Failed to fetch setups');
  return res.json();
}

export function SignalPulseStrip() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['trade-setups'],
    queryFn: fetchSetups,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/60 backdrop-blur-sm h-12 animate-shimmer" />
    );
  }

  if (isError || !data) {
    return (
      <Link
        href="/signals"
        className="group flex items-center justify-between rounded-xl border border-border/30 bg-card/60 backdrop-blur-sm px-3 py-2.5 transition-all hover:border-primary/35 hover:bg-surface/40"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-muted-foreground/40" />
          <span className="font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground/50">
            Signals unavailable
          </span>
        </div>
        <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary transition-colors" />
      </Link>
    );
  }

  const setupCount = data.setups.length;
  const topConfidence = setupCount > 0 ? Math.max(...data.setups.map((s) => s.confidence)) : 0;
  const whaleScore = data.whaleTopScore;

  return (
    <Link
      href="/signals"
      className="group flex items-center gap-3 rounded-xl border border-border/30 bg-card/60 backdrop-blur-sm px-3 py-2.5 transition-all hover:border-primary/35 hover:bg-surface/40"
    >
      {/* Beacon */}
      <div className="relative shrink-0">
        <Activity className="w-3.5 h-3.5 text-primary/70" />
        {setupCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-bullish animate-pulse" />
        )}
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Setups count */}
        <div className="flex items-center gap-1">
          <span className="font-mono-data text-[9px] text-muted-foreground/50 uppercase tracking-wider">Setups</span>
          <span className="font-mono-data text-[12px] font-bold tabular-nums text-foreground/85">{setupCount}</span>
        </div>

        {/* Top confidence */}
        {topConfidence > 0 && (
          <span className={cn(
            'rounded border px-1.5 py-0.5 font-mono-data text-[9px] font-bold tabular-nums',
            topConfidence >= 80
              ? 'border-bullish/40 bg-bullish/10 text-bullish'
              : 'border-primary/30 bg-primary/8 text-primary'
          )}>
            top {topConfidence}
          </span>
        )}

        {/* Whale score */}
        {whaleScore !== null && whaleScore > 0 && (
          <>
            <div className="h-3 w-px bg-border/30" aria-hidden="true" />
            <div className="flex items-center gap-1">
              <span className="font-mono-data text-[9px] text-muted-foreground/50 uppercase tracking-wider">Whale</span>
              <span className={cn(
                'font-mono-data text-[11px] font-bold tabular-nums',
                whaleScore >= 80 ? 'text-bullish' : 'text-foreground/70'
              )}>
                {whaleScore.toFixed(0)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* CTA */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="font-mono-data text-[9px] font-bold uppercase tracking-[0.14em] text-primary/60 group-hover:text-primary transition-colors">
          Signals
        </span>
        <ArrowRight className="h-3 w-3 text-primary/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  );
}
