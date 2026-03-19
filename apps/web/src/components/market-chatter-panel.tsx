'use client';

import { cn } from '@/lib/utils';
import { Radio } from 'lucide-react';
import { LowImpactFeed } from './low-impact-feed';

interface MarketChatterPanelProps {
  className?: string;
  id?: string;
}

export function MarketChatterPanel({ className, id }: MarketChatterPanelProps) {
  return (
    <div
      id={id}
      className={cn(
        'flex flex-col min-h-0 overflow-hidden',
        'rounded-2xl',
        'bg-card/72 backdrop-blur-sm',
        'panel-secondary',
        className
      )}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 border-b border-border/30 bg-surface/18 px-2.5 py-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Radio className="w-3.5 h-3.5 text-muted-foreground/60" aria-hidden="true" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-bullish" aria-hidden="true" />
          </div>
          <span className="text-label font-semibold uppercase tracking-[0.14em] text-foreground/85 font-mono-data">
            Market Chatter
          </span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-border/40 to-transparent" aria-hidden="true" />
        <span className="text-micro font-mono-data text-muted-foreground/65 uppercase tracking-wider">
          Live
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div className="px-2.5 py-2">
          <LowImpactFeed standalone limit={14} />
        </div>
      </div>
    </div>
  );
}
