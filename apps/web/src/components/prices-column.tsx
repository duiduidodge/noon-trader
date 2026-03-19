'use client';

import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Flame, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import Image from 'next/image';
import { formatPrice, formatCompactNumber } from '@/lib/utils';
import { fetchAlpha, type AlphaData, type AlphaItem } from './alpha-widget';

interface CoinPrice {
  id: string;
  rank: number;
  name: string;
  symbol: string;
  image: string | null;
  priceUsd: number;
  changePercent24Hr: number;
  marketCapUsd: number;
  sparkline?: number[];
}

interface PricesResponse {
  majors: CoinPrice[];
  trending: CoinPrice[];
  global: {
    totalMcap: number;
    totalVolume: number;
    btcDominance: number;
    avgChange24h: number;
  };
  asOf?: string;
}

interface MarketOverviewResponse {
  fearGreedIndex: number;
  fearGreedLabel: string;
}

const NUMERIC_TEXT_CLASS = 'font-mono-data tabular-nums tracking-tight';

function formatMovePercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

async function fetchPrices(): Promise<PricesResponse> {
  const res = await fetch('/api/prices');
  if (!res.ok) throw new Error('Failed to fetch prices');
  return res.json();
}

async function fetchMarketOverview(): Promise<MarketOverviewResponse> {
  const res = await fetch('/api/market-overview');
  if (!res.ok) throw new Error('Failed to fetch market overview');
  return res.json();
}

// ─── Compact semicircle gauge ───
function MoodGauge({ value, label }: { value: number; label: string }) {
  const radius = 38;
  const cx = 52;
  const cy = 42;

  const needleAngle = (180 - (value / 100) * 180) * (Math.PI / 180);
  const needleX = cx + (radius - 6) * Math.cos(needleAngle);
  const needleY = cy - (radius - 6) * Math.sin(needleAngle);

  const valueColor =
    value <= 25
      ? 'text-red-400'
      : value <= 45
        ? 'text-orange-400'
        : value <= 55
          ? 'text-yellow-400'
          : 'text-emerald-400';

  return (
    <div
      className="flex flex-col items-center gap-0.5 pt-0.5"
      role="img"
      aria-label={`Fear and Greed Index: ${value}, ${label}`}
    >
      <svg
        viewBox="0 0 104 52"
        className="w-full max-w-[102px] overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="moodGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="25%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="75%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>

        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="url(#moodGradient)"
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.2"
          strokeDasharray="2 6"
        />

        {/* Active arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="url(#moodGradient)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * Math.PI * radius} ${Math.PI * radius}`}
          className="transition-all duration-1000 ease-out"
        />

        {/* Needle reticle */}
        <circle cx={needleX} cy={needleY} r="5" fill="currentColor" opacity="0.2" className={valueColor} />
        <circle cx={needleX} cy={needleY} r="2.5" fill="currentColor" className={valueColor} />
        <line
          x1={cx} y1={cy} x2={needleX} y2={needleY}
          className="text-muted-foreground opacity-30"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="2.5" className="text-muted-foreground" fill="currentColor" />

        {/* Score */}
        <text
          x={cx} y={cy - 10}
          textAnchor="middle"
          className={clsx('font-mono-data font-bold tracking-tighter', valueColor)}
          style={{ fontSize: '22px', fill: 'currentColor', filter: 'drop-shadow(0px 0px 6px currentColor)' }}
        >
          {value}
        </text>
      </svg>

      <span className={clsx('font-mono-data text-[9px] font-semibold uppercase tracking-wider -mt-1', valueColor)}>
        {label}
      </span>
    </div>
  );
}

export function PricesColumn() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['prices'],
    queryFn: fetchPrices,
    refetchInterval: 60_000,
  });
  const { data: marketOverview } = useQuery({
    queryKey: ['market-overview'],
    queryFn: fetchMarketOverview,
    refetchInterval: 60_000,
  });
  const { data: alphaData } = useQuery<AlphaData>({
    queryKey: ['alpha'],
    queryFn: fetchAlpha,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-4 w-32 rounded bg-surface/70" />
        <div className="h-28 rounded-xl border border-border/30 bg-surface/40" />
        <div className="grid grid-cols-3 gap-2">
          <div className="h-16 rounded-lg bg-surface/30" />
          <div className="h-16 rounded-lg bg-surface/30" />
          <div className="h-16 rounded-lg bg-surface/30" />
        </div>
        <div className="shrink-0 space-y-2">
          <div className="h-10 rounded-lg bg-surface/30" />
          <div className="h-10 rounded-lg bg-surface/30" />
          <div className="h-10 rounded-lg bg-surface/30" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-bearish/25 bg-bearish/5 px-unit-4 py-unit-3 text-small text-bearish backdrop-blur-sm">
        Prices unavailable. Please refresh in a moment.
      </div>
    );
  }

  const fgValue = marketOverview?.fearGreedIndex ?? 50;
  const fgLabel = marketOverview?.fearGreedLabel ?? 'Neutral';
  const asOfLabel = data.asOf
    ? new Date(data.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;
  const trendingItems = data.trending.slice(0, 5);
  const trendingMaxAbsChange = Math.max(
    ...trendingItems.map((coin) => Math.abs(coin.changePercent24Hr)),
    1
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-1">
        <h2 className="font-display text-caption font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60" aria-hidden="true" />
          Market Mood
        </h2>
        {asOfLabel && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface/50 border border-border/30">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" aria-hidden="true" />
            <span className={clsx(NUMERIC_TEXT_CLASS, 'text-micro text-muted-foreground/70')}>
              {asOfLabel}
            </span>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex min-h-0 flex-col">
        <div className="space-y-2">
          <div className="relative overflow-visible rounded-[20px] border border-border/40 bg-[linear-gradient(180deg,hsl(var(--surface)/0.38),hsl(var(--surface)/0.18))] px-2.5 py-1 shadow-inner transition-all duration-normal hover:bg-surface/40 hover:border-primary/30">
            <div
              className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/10 to-transparent"
              aria-hidden="true"
            />
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono-data text-[8px] uppercase tracking-[0.18em] text-muted-foreground/48">
                Sentiment regime
              </span>
              <span className="rounded-full border border-border/35 bg-background/35 px-1.5 py-0.5 font-mono-data text-[7px] uppercase tracking-[0.16em] text-muted-foreground/66">
                Fear & Greed
              </span>
            </div>
            <div className="flex justify-center">
              <MoodGauge value={fgValue} label={fgLabel} />
            </div>
          </div>

          <div className="rounded-xl border border-border/30 bg-surface/20 backdrop-blur-md overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-border/25">
              <MetricCard
                label="Mcap"
                value={formatCompactNumber(data.global.totalMcap)}
                change={data.global.avgChange24h}
              />
              <MetricCard label="Volume" value={formatCompactNumber(data.global.totalVolume)} />
              <MetricCard label="BTC Dom" value={`${data.global.btcDominance.toFixed(1)}%`} />
            </div>
          </div>
        </div>

        <div className="mt-1.5 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-display text-caption font-bold uppercase tracking-widest text-muted-foreground">
              Majors
            </h3>
            <div className="flex items-center gap-1">
              <span
                className={clsx(
                  NUMERIC_TEXT_CLASS,
                  'rounded-full border border-border/45 bg-card/50 px-1.5 py-0.5 text-micro uppercase tracking-[0.12em] text-muted-foreground/85 whitespace-nowrap leading-none'
                )}
              >
                24h
              </span>
              {asOfLabel && (
                <span
                  className={clsx(
                    NUMERIC_TEXT_CLASS,
                    'rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-micro uppercase tracking-[0.12em] text-primary/90 whitespace-nowrap leading-none'
                  )}
                >
                  Updated {asOfLabel}
                </span>
              )}
            </div>
          </div>
          <div
            className="mt-0.5 shrink-0 rounded-xl border border-border/25 bg-surface/10 overflow-hidden"
            role="list"
            aria-label="Major cryptocurrencies"
          >
            {data.majors.slice(0, 5).map((coin) => (
              <CoinRow key={coin.id} coin={coin} showSparkline />
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col pt-1.5">
            <div className="mb-1 flex items-center justify-between px-1">
              <h3 className="font-display text-caption font-bold uppercase tracking-widest text-muted-foreground">
                Alpha Signals
              </h3>
              <span className="rounded-full border border-border/35 bg-background/35 px-2 py-0.5 font-mono-data text-[8px] uppercase tracking-[0.14em] text-muted-foreground/68">
                live
              </span>
            </div>
            <div className="flex min-h-0 flex-1 rounded-[18px] border border-border/18 bg-[linear-gradient(180deg,hsl(var(--surface)/0.12),hsl(var(--surface)/0.05))] p-1.5">
              <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-1.5">
                <MiniAlphaSection
                  title="Gainers"
                  icon={TrendingUp}
                  accent="text-bullish"
                  items={alphaData?.gainers.slice(0, 5) ?? []}
                />
                <MiniAlphaSection
                  title="Losers"
                  icon={TrendingDown}
                  accent="text-bearish"
                  items={alphaData?.losers.slice(0, 5) ?? []}
                />
                <MiniAlphaSection
                  title="Trending"
                  icon={Flame}
                  accent="text-orange-400"
                  items={trendingItems.slice(0, 5).map((coin) => ({
                    id: coin.id,
                    symbol: coin.symbol,
                    image: coin.image ?? '',
                    change24h: coin.changePercent24Hr,
                    name: coin.name,
                    price: coin.priceUsd,
                    volume: coin.marketCapUsd,
                    marketCap: coin.marketCapUsd,
                    rank: coin.rank,
                  }))}
                />
                <MiniAlphaSection
                  title="Vol"
                  icon={Zap}
                  accent="text-emerald-400"
                  items={alphaData?.volumeSurge.slice(0, 5) ?? []}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniAlphaSection({
  title,
  icon: Icon,
  accent,
  items,
}: {
  title: string;
  icon: React.ElementType;
  accent: string;
  items: AlphaItem[];
}) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-[10px] bg-background/10 px-1.5 py-1.5">
      <div className="mb-1.5 flex items-center gap-1 px-0.25">
        <Icon className={clsx('h-2.5 w-2.5', accent)} aria-hidden="true" />
        <span className={clsx('font-display text-[10px] font-bold uppercase tracking-[0.12em]', accent)}>
          {title}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-0.5">
        {items.length > 0 ? (
          items.map((item) => (
            <AlphaBoardRow
              key={item.id}
              label={item.symbol}
              name={item.name}
              image={item.image}
              change={item.change24h}
              positive={item.change24h >= 0}
            />
          ))
        ) : (
          <div className="px-2 py-2 font-mono-data text-[8px] uppercase tracking-[0.14em] text-muted-foreground/35">
            No signal
          </div>
        )}
      </div>
    </div>
  );
}

function AlphaBoardRow({
  label,
  name,
  image,
  change,
  positive,
}: {
  label: string;
  name: string;
  image?: string | null;
  change: number;
  positive: boolean;
}) {
  return (
    <div
      className="grid grid-cols-[14px_34px_minmax(0,1fr)_46px] items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-surface/14 transition-colors duration-fast"
      role="listitem"
      aria-label={`${name} ${formatMovePercent(change)} ${positive ? 'up' : 'down'}`}
      title={`${name} (${label})`}
    >
      <div className="h-3.5 w-3.5 overflow-hidden rounded-full bg-muted/30">
        {image ? (
          <Image src={image} alt="" width={14} height={14} unoptimized className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[7px] font-bold text-muted-foreground">
            {label.slice(0, 1)}
          </div>
        )}
      </div>
      <span className="truncate font-mono-data text-[8px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/72">
        {label}
      </span>
      <span className="truncate text-[9px] font-medium tracking-tight leading-none text-foreground/92">
        {name}
      </span>
      <span
        className={clsx(
          'text-right font-mono-data text-[9px] font-bold tabular-nums',
          positive ? 'text-bullish' : 'text-bearish'
        )}
      >
        {formatMovePercent(change)}
      </span>
    </div>
  );
}

// ─── Full-width coin row with sparkline ───
function CoinRow({
  coin,
  showSparkline,
  compact,
}: {
  coin: CoinPrice;
  showSparkline?: boolean;
  compact?: boolean;
}) {
  const isPositive = coin.changePercent24Hr >= 0;
  const directionLabel = isPositive ? 'up' : 'down';

  // Compact rows are rendered by CompactTokenRow in the trending panel.
  if (compact) return null;

  // Full mode (Majors)
  const accentColor = isPositive ? 'hsl(var(--bullish))' : 'hsl(var(--bearish))';

  const sparklineSvg = (() => {
    if (!showSparkline || !coin.sparkline || coin.sparkline.length < 2) return null;
    const d = coin.sparkline;
    const lo = Math.min(...d),
      hi = Math.max(...d);
    const range = hi - lo || 1;
    const W = 100,
      H = 36,
      pad = 1.5;
    const pts = d.map((v, i) => ({
      x: pad + (i / (d.length - 1)) * (W - 2 * pad),
      y: H - pad - ((v - lo) / range) * (H - 2 * pad),
    }));
    const line = pts.map((p) => `${p.x},${p.y}`).join(' ');
    const area = `M ${pts[0].x},${H} ${pts.map((p) => `L ${p.x},${p.y}`).join(' ')} L ${pts[pts.length - 1].x},${H} Z`;
    const gid = `sg-${coin.id}`;
    return (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        role="img"
        aria-label={`24h price chart, trending ${directionLabel}`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={`${pad},${H - pad} ${W - pad},${H - pad}`}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="0.8"
          strokeOpacity="0.45"
          vectorEffect="non-scaling-stroke"
        />
        <path d={area} fill={`url(#${gid})`} />
        <polyline
          points={line}
          fill="none"
          stroke={accentColor}
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  })();

  return (
    <div
      className={clsx(
        'group relative grid grid-cols-[22px_50px_1fr_auto] items-center gap-2 px-2 py-1.5 cursor-default',
        'border-b border-border/15 last:border-0',
        'transition-colors duration-fast',
        isPositive ? 'hover:bg-bullish/[0.04]' : 'hover:bg-bearish/[0.04]'
      )}
      role="listitem"
      aria-label={`${coin.name} ${formatPrice(coin.priceUsd)} ${formatMovePercent(coin.changePercent24Hr)} ${directionLabel}`}
    >
      {/* Left accent bar */}
      <div
        className={clsx(
          'absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-7 rounded-full',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-fast',
          isPositive ? 'bg-bullish' : 'bg-bearish'
        )}
        aria-hidden="true"
      />

      {/* Icon with hover ring */}
      <div className="relative shrink-0">
        <div
          className={clsx(
            'absolute -inset-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-normal',
            isPositive ? 'bg-bullish/10' : 'bg-bearish/10'
          )}
          aria-hidden="true"
        />
        {coin.image ? (
          <Image
            src={coin.image}
            alt=""
            width={20}
            height={20}
            unoptimized
            className="relative h-[20px] w-[20px] rounded-full grayscale-[40%] opacity-75 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-slow"
          />
        ) : (
          <div className="relative h-[20px] w-[20px] rounded-full bg-surface/50 flex items-center justify-center">
            <span className="text-micro font-bold text-muted-foreground">
              {coin.symbol.slice(0, 2)}
            </span>
          </div>
        )}
      </div>

      {/* Symbol + full name */}
      <div className="min-w-0">
        <div className="font-mono-data text-[10px] font-bold text-foreground tracking-tight leading-none">
          {coin.symbol}
        </div>
        <div className="mt-0.5 truncate text-[6px] text-muted-foreground/85 uppercase tracking-[0.1em]">
          {coin.name}
        </div>
      </div>

      <div className="min-w-0 h-4 opacity-80 group-hover:opacity-100 transition-opacity duration-normal">
        {sparklineSvg}
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className={clsx(NUMERIC_TEXT_CLASS, 'text-[10px] font-bold text-foreground leading-none whitespace-nowrap')}>
          {formatPrice(coin.priceUsd)}
        </div>
        <div
          className={clsx(
            'inline-flex items-center rounded-full px-1.5 py-[2px]',
            `${NUMERIC_TEXT_CLASS} text-[8px] font-semibold whitespace-nowrap`,
            'border transition-colors duration-fast',
            isPositive
              ? 'text-bullish/95 bg-bullish/10 border-bullish/25 group-hover:bg-bullish/15'
              : 'text-bearish/95 bg-bearish/14 border-bearish/30 group-hover:bg-bearish/20'
          )}
        >
          {formatMovePercent(coin.changePercent24Hr)}
        </div>
      </div>
    </div>
  );
}

// ─── Metric card (used in the 3-column grid) ───
function MetricCard({ label, value, change }: { label: string; value: string; change?: number }) {
  return (
    <div className="relative flex flex-col px-2 py-1.5 overflow-hidden group hover:bg-surface/30 transition-all duration-normal">
      <div
        className="absolute inset-x-0 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-primary/25 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      />
      <span className="font-mono-data text-[8.5px] text-muted-foreground/50 uppercase tracking-[0.12em] mb-1">
        {label}
      </span>
      <span className={clsx(NUMERIC_TEXT_CLASS, 'text-[12px] font-bold text-foreground leading-none group-hover:text-primary transition-colors duration-fast')}>
        {value}
      </span>
      {change !== undefined && (
        <span className={clsx(`${NUMERIC_TEXT_CLASS} mt-0.5 text-[8px] font-semibold`, change >= 0 ? 'text-bullish' : 'text-bearish')}>
          {formatMovePercent(change)}
        </span>
      )}
    </div>
  );
}
