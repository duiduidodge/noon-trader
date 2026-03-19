'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SetupDetailModal, type SetupDetailItem } from '@/components/signals/setup-detail-modal';

interface SetupResponse {
  generatedAt: string;
  whaleTopScore: number | null;
  setups: SetupDetailItem[];
}

async function fetchSetups(): Promise<SetupResponse> {
  const res = await fetch('/api/signals/setups');
  if (!res.ok) throw new Error('Failed to fetch setups');
  return res.json();
}

export function TradeSetupsPanel() {
  const [selected, setSelected] = useState<SetupDetailItem | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['trade-setups'],
    queryFn: fetchSetups,
    refetchInterval: 60_000,
  });

  const setups = data?.setups || [];

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        {/* Column header */}
        <div className="shrink-0 flex items-center gap-2 border-b border-border/25 bg-surface/15 px-3 py-2">
          <Sparkles className="w-3 h-3 text-primary/70 shrink-0" aria-hidden="true" />
          <span className="font-mono-data text-[9px] font-bold uppercase tracking-[0.2em] text-foreground/75">
            Trade Setups
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-primary/20 to-transparent" aria-hidden="true" />
          {data?.generatedAt && (
            <span className="font-mono-data text-[8px] text-muted-foreground/50 tabular-nums shrink-0">
              {new Date(data.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Setup list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
          {isLoading ? (
            <>
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="h-14 rounded-lg border border-border/20 bg-surface/15 animate-shimmer" />
              ))}
            </>
          ) : isError ? (
            <div className="rounded-lg border border-bearish/30 bg-bearish/8 px-3 py-3 text-center">
              <p className="font-mono-data text-[9px] text-bearish uppercase tracking-wider">
                Setup engine unavailable.
              </p>
            </div>
          ) : setups.length === 0 ? (
            <div className="rounded-lg border border-border/20 bg-surface/10 px-3 py-6 text-center">
              <p className="font-mono-data text-[9px] text-muted-foreground/50 uppercase tracking-wider">
                No high-confidence setups yet.
              </p>
            </div>
          ) : (
            setups.slice(0, 6).map((item, idx) => (
              <SetupCard
                key={item.id}
                item={item}
                index={idx}
                onClick={() => setSelected(item)}
              />
            ))
          )}
        </div>

        {/* Footer if more than 6 */}
        {setups.length > 6 && (
          <div className="shrink-0 border-t border-border/20 px-3 py-1.5">
            <span className="font-mono-data text-[8px] text-muted-foreground/40 uppercase tracking-wider">
              +{setups.length - 6} more setups
            </span>
          </div>
        )}
      </div>

      {/* Detail modal — rendered via portal to escape overflow/backdrop-filter stacking contexts */}
      {mounted && selected && createPortal(
        <SetupDetailModal
          setup={selected}
          onClose={() => setSelected(null)}
        />,
        document.body
      )}
    </>
  );
}

function SetupCard({
  item,
  index,
  onClick,
}: {
  item: SetupDetailItem;
  index: number;
  onClick: () => void;
}) {
  const isHigh = item.confidence >= 80;
  const isLong = item.direction === 'LONG';

  return (
    <button
      onClick={onClick}
      className="group w-full flex flex-col gap-1 rounded-lg border border-border/30 bg-card/40 px-2.5 py-2 text-left transition-all duration-fast hover:border-primary/35 hover:bg-surface/50 cursor-pointer"
    >
      {/* Top row */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono-data text-[8px] tabular-nums text-muted-foreground/35 w-3 shrink-0">
          {index + 1}
        </span>
        <span className="font-mono-data text-[12px] font-bold text-foreground/90 tracking-tight min-w-0 truncate">
          {item.asset}
        </span>
        <span className={cn(
          'shrink-0 rounded border px-1.5 py-px font-mono-data text-[8px] font-bold uppercase tracking-wider',
          isLong
            ? 'border-bullish/40 bg-bullish/10 text-bullish'
            : 'border-bearish/40 bg-bearish/10 text-bearish'
        )}>
          {item.direction}
        </span>
        <span className={cn(
          'shrink-0 rounded border px-1.5 py-px font-mono-data text-[8px] font-bold tabular-nums',
          isHigh
            ? 'border-bullish/40 bg-bullish/8 text-bullish'
            : 'border-primary/30 bg-primary/8 text-primary'
        )}>
          {item.confidence}
        </span>
        {/* Tap hint */}
        <span className="ml-auto font-mono-data text-[7px] text-muted-foreground/25 group-hover:text-muted-foreground/50 uppercase tracking-wider transition-colors shrink-0">
          details
        </span>
      </div>

      {/* Confidence bar */}
      <div className="w-full h-px bg-surface/40 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', isHigh ? 'bg-bullish/50' : 'bg-primary/40')}
          style={{ width: `${item.confidence}%` }}
        />
      </div>

      {/* Thesis */}
      <p className="font-mono-data text-[9px] text-muted-foreground/65 truncate leading-relaxed">
        {item.thesis}
      </p>
    </button>
  );
}
