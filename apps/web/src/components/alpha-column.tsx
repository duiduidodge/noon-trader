'use client';

import { Zap } from 'lucide-react';
import { AlphaWidget } from './alpha-widget';

export function AlphaColumn() {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-bullish animate-pulse" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/80 font-mono-data">
            Alpha
          </span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-border/30 to-transparent" />
        <span className="text-[8px] font-mono-data text-muted-foreground/30 uppercase tracking-wider">
          Live
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AlphaWidget />
      </div>
    </div>
  );
}
