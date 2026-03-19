'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmergingSnapshot {
  id: string;
  status: string;
  signalTime: string;
  hasImmediate: boolean;
  hasEmergingMover: boolean;
  hasDeepClimber: boolean;
  totalMarkets: number | null;
  scansInHistory: number | null;
}

interface EmergingAlert {
  id: string;
  signal: string;
  direction: string | null;
  currentRank: number | null;
  contribution: number | null;
  contribVelocity: number | null;
  traders: number | null;
  priceChg4h: number | null;
  reasonCount: number;
  reasons: string[];
  isImmediate: boolean;
  isDeepClimber: boolean;
  erratic: boolean;
  lowVelocity: boolean;
}

interface EmergingResponse {
  snapshot: EmergingSnapshot | null;
  alerts: EmergingAlert[];
}

async function fetchEmergingSignals(): Promise<EmergingResponse> {
  const res = await fetch('/api/signals/emerging');
  if (!res.ok) throw new Error('Failed to fetch emerging signals');
  return res.json();
}

export function EmergingMoversPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['emerging-movers-signals'],
    queryFn: fetchEmergingSignals,
    refetchInterval: 60_000,
  });

  const alerts = data?.alerts || [];
  const snapshot = data?.snapshot;

  return (
    <section className="rounded-2xl border border-border/35 bg-card/72 backdrop-blur-sm overflow-hidden panel-secondary">
      <div className="flex items-center gap-2 border-b border-border/30 bg-surface/18 px-2.5 py-2">
        <div className="relative">
          <Radio className="w-3.5 h-3.5 text-muted-foreground/60" aria-hidden="true" />
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full',
              snapshot?.hasImmediate ? 'bg-bearish animate-pulse' : 'bg-bullish'
            )}
            aria-hidden="true"
          />
        </div>
        <span className="text-label font-semibold uppercase tracking-[0.14em] text-foreground/85 font-mono-data">
          Emerging Movers
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-border/40 to-transparent" aria-hidden="true" />
        {snapshot?.signalTime ? (
          <span className="text-micro font-mono-data text-muted-foreground/65 uppercase tracking-wider">
            {new Date(snapshot.signalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
            Emerging signal feed unavailable.
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-lg border border-border/30 bg-card/35 px-3 py-2 text-caption text-muted-foreground/75">
            No fresh emerging mover signals yet.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {alerts.slice(0, 6).map((alert) => (
              <a
                key={alert.id}
                href="https://app.hyperliquid.xyz/trade"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded-lg border border-border/35 bg-card/45 px-2.5 py-1.5 transition-all duration-fast hover:border-primary/35 hover:bg-surface/65"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono-data text-caption font-bold text-foreground/90 truncate">
                      {alert.signal}
                    </span>
                    {alert.isImmediate ? (
                      <span className="rounded border border-bearish/45 bg-bearish/12 px-1.5 py-0.5 font-mono-data text-micro font-bold uppercase tracking-wider text-bearish">
                        Immediate
                      </span>
                    ) : null}
                    {alert.isDeepClimber ? (
                      <span className="rounded border border-primary/35 bg-primary/10 px-1.5 py-0.5 font-mono-data text-micro font-bold uppercase tracking-wider text-primary">
                        Deep
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-mono-data text-micro text-muted-foreground/70 truncate">
                    #{alert.currentRank ?? '-'} • {alert.traders ?? '-'} traders • {alert.reasonCount} signals
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
