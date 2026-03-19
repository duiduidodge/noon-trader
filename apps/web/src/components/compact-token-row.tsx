'use client';

import { cn } from '@/lib/utils';
import Image from 'next/image';

const NUMERIC_TEXT_CLASS = 'font-mono-data tabular-nums tracking-tight';

function formatMovePercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

interface CompactTokenRowProps {
  symbol: string;
  image?: string | null;
  change: number;
  sublineText?: string;
  ariaLabel?: string;
  maxAbsChange?: number;
}

export function CompactTokenRow({
  symbol,
  image,
  change,
  sublineText,
  ariaLabel,
  maxAbsChange,
}: CompactTokenRowProps) {
  const positive = change >= 0;
  const barWidth = maxAbsChange ? Math.min(100, (Math.abs(change) / maxAbsChange) * 100) : 0;

  return (
    <div
      className="group relative grid grid-cols-[14px_1fr_68px] items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5 transition-colors duration-fast cursor-default"
      role="listitem"
      aria-label={ariaLabel ?? `${symbol} ${formatMovePercent(change)}`}
    >
      <div
        className={cn(
          'absolute inset-y-0 left-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-fast',
          positive ? 'bg-bullish/5' : 'bg-bearish/5'
        )}
        style={maxAbsChange ? { width: `${barWidth}%` } : undefined}
        aria-hidden="true"
      />

      <div className="relative z-10 shrink-0 w-3.5 h-3.5 rounded-full overflow-hidden bg-muted/30">
        {image ? (
          <Image src={image} alt="" width={14} height={14} className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[7px] font-bold text-muted-foreground">
            {symbol.slice(0, 2)}
          </div>
        )}
      </div>

      <div className="relative z-10 min-w-0 space-y-0.5">
        <span className="block text-small font-semibold uppercase tracking-[0.08em] text-foreground/95 font-body shrink-0 truncate">
          {symbol}
        </span>
        {sublineText ? (
          <span className="block text-caption text-muted-foreground/85 font-mono-data leading-none">
            {sublineText}
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          `relative z-10 text-small font-semibold ${NUMERIC_TEXT_CLASS} text-right flex items-center justify-end gap-0.5 transition-transform duration-fast group-hover:translate-x-0.5`,
          positive ? 'text-bullish/95' : 'text-bearish/95'
        )}
      >
        {formatMovePercent(change)}
      </div>
    </div>
  );
}
