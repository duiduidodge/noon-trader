'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Zap } from 'lucide-react';
import Image from 'next/image';
import { CompactTokenRow } from './compact-token-row';

interface AlphaItem {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  change24h: number;
  volume: number;
  marketCap: number;
  rank: number;
  volumeToMcap?: number;
}

interface AlphaData {
  gainers: AlphaItem[];
  losers: AlphaItem[];
  volumeSurge: AlphaItem[];
  asOf: string | null;
}

const NUMERIC_TEXT_CLASS = 'font-mono-data tabular-nums tracking-tight';

function formatMovePercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

async function fetchAlpha(): Promise<AlphaData> {
  const res = await fetch('/api/alpha');
  if (!res.ok) throw new Error('Failed to fetch alpha data');
  return res.json();
}

function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(6);
}

export { fetchAlpha };
export type { AlphaData, AlphaItem };

// ─── Sub-components ───

function MoverRow({
  item,
  showVol = false,
  maxAbsChange,
  compact = false,
}: {
  item: AlphaItem;
  showVol?: boolean;
  maxAbsChange: number;
  compact?: boolean;
}) {
  const positive = item.change24h >= 0;
  const barWidth = Math.min(100, (Math.abs(item.change24h) / maxAbsChange) * 100);
  const volCapPct = item.volumeToMcap != null ? `${(item.volumeToMcap * 100).toFixed(0)}%` : '';
  const directionLabel = positive ? 'up' : 'down';

  if (compact) {
    return (
      <CompactTokenRow
        symbol={item.symbol}
        image={item.image}
        change={item.change24h}
        maxAbsChange={maxAbsChange}
        ariaLabel={`${item.symbol} ${formatMovePercent(item.change24h)} ${directionLabel}`}
      />
    );
  }

  return (
    <div
      className="group relative flex h-[34px] items-center gap-2 rounded-lg px-2 hover:bg-white/5 transition-colors duration-fast cursor-default"
      role="listitem"
      aria-label={`${item.name} $${fmtPrice(item.price)} ${formatMovePercent(item.change24h)} ${directionLabel}`}
    >
      <div
        className={cn(
          'absolute inset-y-0 left-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-fast',
          positive ? 'bg-bullish/5' : 'bg-bearish/5'
        )}
        style={{ width: `${barWidth}%` }}
        aria-hidden="true"
      />

      <div className="relative z-10 shrink-0 w-[18px] h-[18px] rounded-full overflow-hidden bg-muted/30">
        {item.image ? (
          <Image src={item.image} alt="" width={18} height={18} className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[7px] font-bold text-muted-foreground">
            {item.symbol.slice(0, 2)}
          </div>
        )}
      </div>

      <div className="relative z-10 flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-caption font-bold text-foreground font-mono-data">
            {item.symbol}
          </span>
          <span className="text-micro text-muted-foreground/65 truncate hidden xl:block">
            {item.name}
          </span>
        </div>
        {showVol && item.volumeToMcap != null && (
          <div className="text-micro text-muted-foreground/65 font-mono-data">v/c {volCapPct}</div>
        )}
      </div>

      <div
        className={cn(
          `relative z-10 text-caption ${NUMERIC_TEXT_CLASS} text-muted-foreground/70 text-right hidden sm:block`
        )}
      >
        ${fmtPrice(item.price)}
      </div>

      <div
        className={cn(
          `relative z-10 shrink-0 text-caption font-bold ${NUMERIC_TEXT_CLASS} text-right min-w-[52px] flex items-center justify-end gap-0.5`,
          positive ? 'text-bullish' : 'text-bearish'
        )}
      >
        {formatMovePercent(item.change24h)}
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  items,
  showVol = false,
  accent,
  compact = false,
  asOf,
}: {
  title: string;
  icon: React.ElementType;
  items: AlphaItem[];
  showVol?: boolean;
  accent: 'bullish' | 'bearish' | 'primary';
  compact?: boolean;
  asOf?: string | null;
}) {
  const maxAbsChange = Math.max(...items.map((i) => Math.abs(i.change24h)), 1);

  const accentCls = {
    bullish: 'text-bullish border-bullish/30 bg-bullish/10',
    bearish: 'text-bearish border-bearish/30 bg-bearish/10',
    primary: 'text-primary border-primary/30 bg-primary/10',
  }[accent];

  return (
    <div className="mb-0.5">
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <div
          className={cn(
            'flex items-center gap-1 rounded px-1.5 py-0.5 border text-caption font-bold uppercase tracking-[0.12em]',
            accentCls
          )}
        >
          <Icon className="w-2.5 h-2.5" aria-hidden="true" />
          {title}
        </div>
        <div className="flex-1 h-px bg-border/20" aria-hidden="true" />
        <span className="rounded-full border border-border/45 bg-card/40 px-2 py-0.5 font-mono-data text-caption uppercase tracking-[0.08em] text-muted-foreground/95 whitespace-nowrap leading-none">
          24h
        </span>
        {asOf && (
          <span
            className={cn(
              `${NUMERIC_TEXT_CLASS} rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-micro uppercase tracking-[0.12em] text-primary/85 whitespace-nowrap leading-none`
            )}
          >
            {new Date(asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div role="list" aria-label={`Top ${title.toLowerCase()}`}>
        {items.map((item) => (
          <MoverRow
            key={item.id}
            item={item}
            showVol={showVol}
            maxAbsChange={maxAbsChange}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Volume Surge Widget ───
export function VolumeSurgeWidget() {
  const { data, isLoading, isError } = useQuery<AlphaData>({
    queryKey: ['alpha'],
    queryFn: fetchAlpha,
    refetchInterval: 60_000,
  });

  if (isLoading || isError || !data)
    return <div className="h-40 animate-pulse bg-muted/10 rounded-xl" />;

  const items = data.volumeSurge.slice(0, 5);
  const maxAbsChange = Math.max(...items.map((i) => Math.abs(i.change24h)), 1);

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-1 px-1">
        <div className="p-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
          <Zap className="h-2.5 w-2.5 text-emerald-500 fill-emerald-500/20" aria-hidden="true" />
        </div>
        <h3 className="font-display text-caption font-bold uppercase tracking-[0.12em] text-emerald-500/90">
          Vol Surge
        </h3>
      </div>
      <div
        className="space-y-0.5 p-1 rounded-xl bg-surface/12 border border-border/30 backdrop-blur-sm overflow-hidden overflow-x-hidden"
        role="list"
        aria-label="Volume surge tokens"
      >
        {items.map((item) => (
          <MoverRow key={item.id} item={item} showVol compact maxAbsChange={maxAbsChange} />
        ))}
      </div>
    </div>
  );
}

export function GainersLosersWidget() {
  const { data, isLoading } = useQuery<AlphaData>({
    queryKey: ['alpha'],
    queryFn: fetchAlpha,
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return <div className="h-40 animate-pulse bg-muted/10 rounded-xl" />;
  }

  const gainersMaxAbs = Math.max(...data.gainers.slice(0, 5).map((i) => Math.abs(i.change24h)), 1);
  const losersMaxAbs = Math.max(...data.losers.slice(0, 5).map((i) => Math.abs(i.change24h)), 1);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {/* Gainers */}
      <div className="flex flex-col min-h-[220px] bg-surface/30 backdrop-blur-md rounded-2xl border border-border/40 shadow-inner relative overflow-hidden group hover:bg-surface/40 hover:border-primary/30 transition-all duration-normal">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-bullish/60 via-transparent to-transparent" />

        <div className="flex items-center justify-between mb-2 border-b border-border/20 pb-2.5 px-3.5 pt-3.5 relative">
          <div className="absolute bottom-0 left-0 w-1/3 h-[1px] bg-gradient-to-r from-bullish/40 to-transparent" />
          <div className="flex items-center gap-2 rounded bg-bullish/10 px-2 py-1 shadow-[0_0_12px_rgba(34,197,94,0.15)] border border-bullish/20">
            <TrendingUp className="h-3.5 w-3.5 text-bullish animate-pulse" />
            <span className="font-mono-data text-[11px] font-bold uppercase tracking-[0.2em] text-bullish drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]">
              Gainers
            </span>
          </div>
          <span className="font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground/60 bg-surface/50 px-2 py-0.5 rounded-full border border-border/30">
            24H
          </span>
        </div>

        <div className="flex flex-col px-1.5 pb-1.5 gap-0.5">
          {data.gainers.slice(0, 5).map((item) => (
            <CompactTokenRow
              key={item.id}
              symbol={item.symbol}
              image={item.image}
              change={item.change24h}
              maxAbsChange={gainersMaxAbs}
              ariaLabel={`${item.symbol} ${formatMovePercent(item.change24h)} up`}
            />
          ))}
        </div>
      </div>

      {/* Losers */}
      <div className="flex flex-col min-h-[220px] bg-surface/30 backdrop-blur-md rounded-2xl border border-border/40 shadow-inner relative overflow-hidden group hover:bg-surface/40 hover:border-primary/30 transition-all duration-normal">
        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-bearish/60 via-transparent to-transparent" />

        <div className="flex items-center justify-between mb-2 border-b border-border/20 pb-2.5 px-3.5 pt-3.5 relative">
          <div className="absolute bottom-0 left-0 w-1/3 h-[1px] bg-gradient-to-r from-bearish/40 to-transparent" />
          <div className="flex items-center gap-2 rounded bg-bearish/10 px-2 py-1 shadow-[0_0_12px_rgba(239,68,68,0.15)] border border-bearish/20">
            <TrendingDown className="h-3.5 w-3.5 text-bearish animate-pulse" />
            <span className="font-mono-data text-[11px] font-bold uppercase tracking-[0.2em] text-bearish drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
              Losers
            </span>
          </div>
          <span className="font-mono-data text-[10px] uppercase tracking-widest text-muted-foreground/60 bg-surface/50 px-2 py-0.5 rounded-full border border-border/30">
            24H
          </span>
        </div>

        <div className="flex flex-col px-1.5 pb-1.5 gap-0.5">
          {data.losers.slice(0, 5).map((item) => (
            <CompactTokenRow
              key={item.id}
              symbol={item.symbol}
              image={item.image}
              change={item.change24h}
              maxAbsChange={losersMaxAbs}
              ariaLabel={`${item.symbol} ${formatMovePercent(item.change24h)} down`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Legacy export
export function AlphaWidget() {
  return <VolumeSurgeWidget />;
}
