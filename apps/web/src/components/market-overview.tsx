'use client';

import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { BarChart3, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCompactNumber, formatPercent } from '@/lib/utils';

interface MarketOverviewData {
  totalMarketCap: number;
  totalVolume: number;
  btcDominance: number;
  marketCapChange24h: number;
  fearGreedIndex: number;
  fearGreedLabel: string;
  sparkline: number[];
}

async function fetchMarketOverview(): Promise<MarketOverviewData> {
  const res = await fetch('/api/market-overview');
  if (!res.ok) throw new Error('Failed to fetch market overview');
  return res.json();
}

export function MarketOverview() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['market-overview'],
    queryFn: fetchMarketOverview,
    refetchInterval: 60_000,
  });

  return (
    <section className="glass rounded-lg overflow-hidden">
      <div className="h-[1px] bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      <div className="p-4">
        {/* Header */}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 border border-accent/20">
            <BarChart3 className="h-4 w-4 text-accent" />
          </div>
          <h2 className="font-display text-sm font-semibold tracking-wide text-foreground">
            Market Overview
          </h2>
          {dataUpdatedAt > 0 && (
            <span className="ml-auto font-mono-data text-[10px] text-muted-foreground/45">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {isLoading ? (
          <LoadingSkeleton />
        ) : error || !data ? (
          <div className="rounded-md border border-bearish/30 bg-bearish/10 px-4 py-3 text-xs text-bearish">
            Market overview is temporarily unavailable.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Left — Market Cap hero card */}
            <MarketCapCard
              value={data.totalMarketCap}
              change={data.marketCapChange24h}
              sparkline={data.sparkline}
            />

            {/* Right — Volume, BTC Dom, Fear & Greed */}
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="24H Volume" value={formatCompactNumber(data.totalVolume)} />
                <MetricCard
                  label="BTC Dom."
                  value={`${data.btcDominance.toFixed(1)}`}
                  suffix="%"
                />
              </div>
              <FearGreedGauge value={data.fearGreedIndex} label={data.fearGreedLabel} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Market Cap Hero Card                                               */
/* ------------------------------------------------------------------ */

function MarketCapCard({
  value,
  change,
  sparkline,
}: {
  value: number;
  change: number;
  sparkline: number[];
}) {
  const positive = change >= 0;

  return (
    <div className="rounded-lg border border-border/40 bg-surface/40 p-4 flex flex-col">
      <div className="flex items-start justify-between mb-1">
        <span className="font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground/60">
          Total Market Cap
        </span>
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono-data text-[11px] font-semibold',
            positive
              ? 'bg-bullish/15 text-bullish border border-bullish/20'
              : 'bg-bearish/15 text-bearish border border-bearish/20'
          )}
        >
          {positive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {formatPercent(change)}
        </span>
      </div>

      <div className="font-mono-data text-[28px] font-bold text-foreground leading-tight mb-4">
        {formatCompactNumber(value)}
      </div>

      {sparkline.length > 0 && (
        <div className="mt-auto">
          <SparklineBars data={sparkline} positive={positive} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Simple Metric Card                                                 */
/* ------------------------------------------------------------------ */

function MetricCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-surface/40 px-3.5 py-3">
      <span className="mb-1.5 block font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      <span className="font-mono-data text-lg font-bold text-foreground">
        {value}
        {suffix && (
          <span className="text-sm text-muted-foreground/60 ml-0.5">{suffix}</span>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sparkline Bars                                                     */
/* ------------------------------------------------------------------ */

function SparklineBars({ data, positive }: { data: number[]; positive: boolean }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  return (
    <div className="flex items-end gap-[3px] h-10">
      {data.map((value, i) => {
        const normalized = (value - min) / range;
        const height = Math.max(18, normalized * 100);
        const isLast = i === data.length - 1;

        return (
          <div
            key={i}
            className={clsx(
              'flex-1 rounded-[2px]',
              positive
                ? isLast
                  ? 'bg-bullish/50'
                  : 'bg-bullish/20'
                : isLast
                  ? 'bg-bearish/50'
                  : 'bg-bearish/20'
            )}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Fear & Greed Gauge                                                 */
/* ------------------------------------------------------------------ */

function FearGreedGauge({ value, label }: { value: number; label: string }) {
  const getColorClass = (v: number) => {
    if (v <= 25) return 'text-bearish';
    if (v <= 45) return 'text-orange-400';
    if (v <= 55) return 'text-yellow-400';
    return 'text-bullish';
  };

  const getIndicatorColor = (v: number) => {
    if (v <= 25) return 'hsl(0 85% 55%)';
    if (v <= 45) return 'hsl(30 90% 55%)';
    if (v <= 55) return 'hsl(50 90% 55%)';
    if (v <= 75) return 'hsl(120 60% 45%)';
    return 'hsl(160 90% 50%)';
  };

  const colorClass = getColorClass(value);

  return (
    <div className="rounded-lg border border-border/40 bg-surface/40 px-3.5 py-3 flex-1">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground/60">
          Fear & Greed Index
        </span>
        <span className={clsx('font-mono-data text-xl font-bold', colorClass)}>
          {value}
        </span>
      </div>

      {/* Gauge track */}
      <div className="relative h-1.5 rounded-full overflow-visible mb-2.5">
        {/* Gradient background */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'linear-gradient(to right, hsl(0 85% 55%), hsl(25 90% 55%), hsl(50 90% 55%), hsl(120 60% 45%), hsl(160 90% 50%))',
          }}
        />
        {/* Indicator */}
        <div
          className="absolute top-1/2 h-3.5 w-3.5 rounded-full border-2 border-background shadow-lg shadow-black/40"
          style={{
            left: `clamp(7px, ${value}%, calc(100% - 7px))`,
            transform: 'translate(-50%, -50%)',
            background: getIndicatorColor(value),
          }}
        />
      </div>

      <span className={clsx('font-mono-data text-[11px] font-medium', colorClass)}>
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="rounded-lg border border-border/40 bg-surface/40 p-4 h-[156px] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-accent/40" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/40 bg-surface/40 h-[68px] animate-shimmer" />
          <div className="rounded-lg border border-border/40 bg-surface/40 h-[68px] animate-shimmer" />
        </div>
        <div className="rounded-lg border border-border/40 bg-surface/40 flex-1 min-h-[76px] animate-shimmer" />
      </div>
    </div>
  );
}
