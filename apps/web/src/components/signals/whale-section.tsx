'use client';

import { cn } from '@/lib/utils';
import { Waves, ExternalLink } from 'lucide-react';

interface WhaleTrader {
  id: string;
  walletAddress: string;
  score: number | null;
  rank: number | null;
  consistency: string | null;
  riskLabel: string | null;
  pnlRank: string | null;
  winRate: number | null;
  holdTimeHours: number | null;
  maxDrawdownPct: number | null;
  allocationPct: number | null;
  overlapRiskPct: number | null;
}

interface WhaleSnapshot {
  timeframe: string;
  candidates: number | null;
  selectedCount: number | null;
}

interface Props {
  snapshot: WhaleSnapshot | null;
  traders: WhaleTrader[];
}

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-bullish';
  if (score >= 60) return 'text-yellow-400';
  return 'text-bearish';
}

const CONSISTENCY_COLORS: Record<string, string> = {
  ELITE: 'border-amber-400/40 bg-amber-400/10 text-amber-400',
  RELIABLE: 'border-bullish/35 bg-bullish/10 text-bullish',
  BALANCED: 'border-primary/35 bg-primary/10 text-primary',
  STREAKY: 'border-orange-400/35 bg-orange-400/10 text-orange-400',
};

export function WhaleSection({ snapshot, traders }: Props) {
  return (
    <div className="flex flex-col min-h-0">
      {/* Row header */}
      <div className="flex items-center gap-2 border-b border-border/25 bg-surface/15 px-3 py-2">
        <Waves className="w-3 h-3 text-violet-400/70 shrink-0" aria-hidden="true" />
        <span className="font-mono-data text-[9px] font-bold uppercase tracking-[0.2em] text-foreground/75">
          Whale Index
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-violet-400/20 to-transparent" aria-hidden="true" />

        {/* Snapshot meta inline */}
        {snapshot && (
          <div className="flex items-center gap-3 shrink-0">
            <MetaInline label="Candidates" value={String(snapshot.candidates ?? '—')} />
            <MetaInline label="Selected" value={String(snapshot.selectedCount ?? '—')} />
            <MetaInline label="TF" value={snapshot.timeframe} />
          </div>
        )}

        <span className="font-mono-data text-[8px] font-bold tabular-nums text-violet-400/70 ml-2">
          {traders.length} tracked
        </span>
      </div>

      {/* Compact horizontal-scroll table */}
      <div className="overflow-x-auto custom-scrollbar">
        {traders.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <p className="font-mono-data text-[9px] text-muted-foreground/40 uppercase tracking-wider">
              No whale data available
            </p>
          </div>
        ) : (
          <table className="w-full text-left min-w-[720px]">
            <thead>
              <tr className="border-b border-border/20 bg-surface/12">
                {[
                  { label: '#', cls: 'w-7' },
                  { label: 'Wallet', cls: '' },
                  { label: 'Score', cls: 'text-right' },
                  { label: 'Win%', cls: 'text-right' },
                  { label: 'Rank', cls: 'text-right' },
                  { label: 'Hold', cls: 'text-right' },
                  { label: 'DD%', cls: 'text-right' },
                  { label: 'Overlap', cls: 'text-right' },
                  { label: 'Alloc', cls: 'text-right' },
                  { label: 'Risk', cls: '' },
                  { label: 'Style', cls: '' },
                ].map((h) => (
                  <th
                    key={h.label}
                    className={cn(
                      'px-2.5 py-1.5 font-mono-data text-[7px] font-bold uppercase tracking-[0.16em] text-muted-foreground/45 whitespace-nowrap',
                      h.cls
                    )}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {traders.map((trader, idx) => (
                <tr
                  key={trader.id}
                  className={cn(
                    'group border-b border-border/10 transition-colors hover:bg-surface/25 cursor-pointer',
                    idx % 2 === 0 ? 'bg-surface/6' : 'bg-transparent'
                  )}
                  onClick={() => window.open(`https://hyperdash.com/address/${trader.walletAddress}`, '_blank', 'noopener,noreferrer')}
                >
                  {/* Index */}
                  <td className="px-2.5 py-1.5 font-mono-data text-[8px] tabular-nums text-muted-foreground/30">
                    {idx + 1}
                  </td>

                  {/* Wallet */}
                  <td className="px-2.5 py-1.5 font-mono-data text-[10px] font-bold text-foreground/75 tracking-tight whitespace-nowrap group-hover:text-primary/80 transition-colors">
                    <span className="flex items-center gap-1">
                      {shortWallet(trader.walletAddress)}
                      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </td>

                  {/* Score */}
                  <td className={cn(
                    'px-2.5 py-1.5 font-mono-data text-[11px] font-bold tabular-nums text-right',
                    trader.score !== null ? scoreColor(trader.score) : 'text-muted-foreground/30'
                  )}>
                    {trader.score?.toFixed(1) ?? '—'}
                  </td>

                  {/* Win Rate */}
                  <td className="px-2.5 py-1.5 font-mono-data text-[10px] tabular-nums text-foreground/65 text-right">
                    {trader.winRate?.toFixed(1) ?? '—'}%
                  </td>

                  {/* Rank */}
                  <td className="px-2.5 py-1.5 font-mono-data text-[10px] tabular-nums text-foreground/65 text-right">
                    #{trader.rank ?? '—'}
                  </td>

                  {/* Hold time */}
                  <td className="px-2.5 py-1.5 font-mono-data text-[10px] tabular-nums text-foreground/65 text-right">
                    {trader.holdTimeHours?.toFixed(1) ?? '—'}h
                  </td>

                  {/* Max Drawdown */}
                  <td className={cn(
                    'px-2.5 py-1.5 font-mono-data text-[10px] tabular-nums text-right',
                    (trader.maxDrawdownPct ?? 0) > 15 ? 'text-bearish' : 'text-foreground/65'
                  )}>
                    {trader.maxDrawdownPct?.toFixed(1) ?? '—'}%
                  </td>

                  {/* Overlap Risk */}
                  <td className={cn(
                    'px-2.5 py-1.5 font-mono-data text-[10px] tabular-nums text-right',
                    (trader.overlapRiskPct ?? 0) > 50 ? 'text-orange-400' : 'text-foreground/65'
                  )}>
                    {trader.overlapRiskPct?.toFixed(1) ?? '—'}%
                  </td>

                  {/* Allocation */}
                  <td className="px-2.5 py-1.5 font-mono-data text-[10px] tabular-nums text-foreground/65 text-right">
                    {trader.allocationPct?.toFixed(1) ?? '—'}%
                  </td>

                  {/* Risk label */}
                  <td className="px-2.5 py-1.5">
                    {trader.riskLabel ? (
                      <span className="rounded border border-border/25 bg-surface/20 px-1 py-px font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/60 whitespace-nowrap">
                        {trader.riskLabel}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/25 font-mono-data text-[9px]">—</span>
                    )}
                  </td>

                  {/* Consistency style */}
                  <td className="px-2.5 py-1.5">
                    {trader.consistency ? (
                      <span className={cn(
                        'rounded border px-1 py-px font-mono-data text-[7px] font-bold uppercase tracking-wider whitespace-nowrap',
                        CONSISTENCY_COLORS[trader.consistency] || 'border-border/25 bg-surface/20 text-muted-foreground/55'
                      )}>
                        {trader.consistency}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/25 font-mono-data text-[9px]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MetaInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/40">{label}</span>
      <span className="font-mono-data text-[9px] font-bold tabular-nums text-foreground/60">{value}</span>
    </div>
  );
}
