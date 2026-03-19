'use client';

import { useQuery } from '@tanstack/react-query';
import { Waves } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WhaleSnapshot {
  id: string;
  scanTime: string;
  timeframe: string;
  candidates: number | null;
  selectedCount: number | null;
}

interface WhaleTrader {
  id: string;
  walletAddress: string;
  score: number | null;
  rank: number | null;
  consistency: string | null;
  allocationPct: number | null;
  winRate: number | null;
}

interface WhaleResponse {
  snapshot: WhaleSnapshot | null;
  traders: WhaleTrader[];
}

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

async function fetchWhaleSignals(): Promise<WhaleResponse> {
  const res = await fetch('/api/signals/whales');
  if (!res.ok) throw new Error('Failed to fetch whale signals');
  return res.json();
}

export function WhaleIndexPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['whale-signals'],
    queryFn: fetchWhaleSignals,
    refetchInterval: 60_000,
  });

  const traders = data?.traders || [];

  return (
    <section className="rounded-2xl border border-border/35 bg-card/72 backdrop-blur-sm overflow-hidden panel-secondary">
      <div className="flex items-center gap-2 border-b border-border/30 bg-surface/18 px-2.5 py-2">
        <Waves className="w-3.5 h-3.5 text-primary/80" aria-hidden="true" />
        <span className="text-label font-semibold uppercase tracking-[0.14em] text-foreground/85 font-mono-data">
          Whale Index
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
            Whale feed unavailable.
          </div>
        ) : traders.length === 0 ? (
          <div className="rounded-lg border border-border/30 bg-card/35 px-3 py-2 text-caption text-muted-foreground/75">
            No whale snapshot yet.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {traders.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-lg border border-border/35 bg-card/45 px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono-data text-caption font-bold text-foreground/90 truncate">
                      {shortWallet(item.walletAddress)}
                    </span>
                    <span
                      className={cn(
                        'rounded border px-1.5 py-0.5 font-mono-data text-micro font-bold uppercase tracking-wider',
                        (item.score || 0) >= 80
                          ? 'border-bullish/45 bg-bullish/12 text-bullish'
                          : 'border-primary/35 bg-primary/10 text-primary'
                      )}
                    >
                      {item.score?.toFixed(1) ?? '-'}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono-data text-micro text-muted-foreground/70 truncate">
                    alloc {item.allocationPct?.toFixed(1) ?? '-'}% • win {item.winRate?.toFixed(1) ?? '-'}% • #{item.rank ?? '-'}
                  </p>
                </div>
                {item.consistency ? (
                  <span className="rounded border border-border/35 bg-card/30 px-1.5 py-0.5 font-mono-data text-micro uppercase text-muted-foreground/80">
                    {item.consistency}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
