'use client';

import { cn } from '@/lib/utils';

interface PillarScores {
  smartMoney?: number;
  marketStructure?: number;
  technicals?: number;
  funding?: number;
}

const PILLARS = [
  { key: 'smartMoney' as const, label: 'SM', color: 'bg-cyan-400', textColor: 'text-cyan-400' },
  { key: 'marketStructure' as const, label: 'STRUCT', color: 'bg-amber-400', textColor: 'text-amber-400' },
  { key: 'technicals' as const, label: 'TECH', color: 'bg-emerald-400', textColor: 'text-emerald-400' },
  { key: 'funding' as const, label: 'FUND', color: 'bg-violet-400', textColor: 'text-violet-400' },
];

export function PillarBar({ scores }: { scores: PillarScores | null }) {
  if (!scores) {
    return (
      <div className="h-6 rounded bg-surface/30 border border-border/20 flex items-center justify-center">
        <span className="font-mono-data text-micro text-muted-foreground/40">No pillar data</span>
      </div>
    );
  }

  const total = PILLARS.reduce((sum, p) => sum + (scores[p.key] ?? 0), 0) || 1;

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-surface/30 border border-border/20">
        {PILLARS.map((pillar) => {
          const value = scores[pillar.key] ?? 0;
          const pct = (value / total) * 100;
          return (
            <div
              key={pillar.key}
              className={cn(pillar.color, 'transition-all duration-500')}
              style={{ width: `${pct}%`, opacity: value > 0 ? 0.85 : 0.15 }}
            />
          );
        })}
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-1.5 px-0.5">
        {PILLARS.map((pillar) => {
          const value = scores[pillar.key] ?? 0;
          return (
            <div key={pillar.key} className="flex items-center gap-1">
              <span className={cn('font-mono-data text-[8px] font-bold uppercase tracking-wider', pillar.textColor, value === 0 && 'opacity-30')}>
                {pillar.label}
              </span>
              <span className={cn('font-mono-data text-[9px] font-bold tabular-nums', value === 0 ? 'text-muted-foreground/30' : 'text-foreground/70')}>
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
