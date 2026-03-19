'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OpportunitySnapshot {
  id: string;
  scanTime: string;
  createdAt: string;
  assetsScanned: number | null;
  passedStage1: number | null;
  passedStage2: number | null;
  deepDived: number | null;
  disqualified: number | null;
}

interface OpportunityItem {
  id: string;
  asset: string;
  direction: string | null;
  leverage: number | null;
  finalScore: number | null;
  scoreDelta: number | null;
  scanStreak: number | null;
  hourlyTrend: string | null;
  trendAligned: boolean;
  risks: string[];
}

interface OpportunityResponse {
  snapshot: OpportunitySnapshot | null;
  opportunities: OpportunityItem[];
}

async function fetchOpportunitySignals(): Promise<OpportunityResponse> {
  const res = await fetch('/api/signals/opportunities');
  if (!res.ok) throw new Error('Failed to fetch opportunity signals');
  return res.json();
}

export function OpportunitySignalsPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['opportunity-signals'],
    queryFn: fetchOpportunitySignals,
    refetchInterval: 60_000,
  });

  const opportunities = data?.opportunities || [];

  return (
    <section className="rounded-2xl border border-border/35 bg-card/72 backdrop-blur-sm overflow-hidden panel-secondary">
      <div className="flex items-center gap-2 border-b border-border/30 bg-surface/18 px-2.5 py-2">
        <Target className="w-3.5 h-3.5 text-primary/80" aria-hidden="true" />
        <span className="text-label font-semibold uppercase tracking-[0.14em] text-foreground/85 font-mono-data">
          Opportunity Radar
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-border/40 to-transparent" aria-hidden="true" />
        {data?.snapshot?.scanTime ? (
          <span className="text-micro font-mono-data text-muted-foreground/65 uppercase tracking-wider">
            {new Date(data.snapshot.scanTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : null}
      </div>

      <div className="px-2.5 py-2">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-12 rounded-lg border border-border/25 bg-card/35 animate-shimmer" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-lg border border-bearish/35 bg-bearish/8 px-3 py-2 text-caption text-bearish">
            Opportunity feed unavailable.
          </div>
        ) : opportunities.length === 0 ? (
          <div className="rounded-lg border border-border/30 bg-card/35 px-3 py-2 text-caption text-muted-foreground/75">
            No active opportunities right now.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {opportunities.slice(0, 6).map((item) => (
              <a
                key={item.id}
                href="https://app.hyperliquid.xyz/trade"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-lg border border-border/35 bg-card/45 px-2.5 py-1.5 transition-all duration-fast hover:border-primary/35 hover:bg-surface/65"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono-data text-caption font-bold text-foreground/90 truncate">
                      {item.asset} {item.direction || ''}
                    </span>
                    <span
                      className={cn(
                        'rounded border px-1.5 py-0.5 font-mono-data text-micro font-bold uppercase tracking-wider',
                        (item.finalScore || 0) >= 220
                          ? 'border-bullish/45 bg-bullish/12 text-bullish'
                          : 'border-primary/35 bg-primary/10 text-primary'
                      )}
                    >
                      {item.finalScore ?? '-'}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono-data text-micro text-muted-foreground/70 truncate">
                    streak {item.scanStreak ?? 0} • delta {item.scoreDelta ?? 0} • {item.hourlyTrend || 'N/A'}
                  </p>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors duration-fast" />
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
