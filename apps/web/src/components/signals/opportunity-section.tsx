'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Target, ArrowUpRight, ChevronDown, ChevronUp } from 'lucide-react';
import { PillarBar } from './pillar-bar';
import { TechnicalsGrid } from './technicals-grid';

interface OpportunityItem {
  id: string;
  asset: string;
  direction: string | null;
  leverage: number | null;
  finalScore: number | null;
  scoreDelta: number | null;
  scanStreak: number | null;
  hourlyTrend: string | null;
  trendAligned: boolean;
  risks: string[];
  pillarScores: Record<string, unknown> | null;
  smartMoney: Record<string, unknown> | null;
  technicals: Record<string, unknown> | null;
  funding: Record<string, unknown> | null;
}

interface OpportunitySnapshot {
  assetsScanned: number | null;
  passedStage1: number | null;
  passedStage2: number | null;
  deepDived: number | null;
  disqualified: number | null;
  filteredByGates: number | null;
  btcContext: Record<string, unknown> | null;
}

interface Props {
  snapshot: OpportunitySnapshot | null;
  items: OpportunityItem[];
}

export function OpportunitySection({ snapshot, items }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Column header */}
      <div className="shrink-0 flex items-center gap-2 border-b border-border/25 bg-surface/15 px-3 py-2">
        <Target className="w-3 h-3 text-cyan-400/70 shrink-0" aria-hidden="true" />
        <span className="font-mono-data text-[9px] font-bold uppercase tracking-[0.2em] text-foreground/75">
          Opportunity Scanner
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-cyan-400/20 to-transparent" aria-hidden="true" />
        <span className="font-mono-data text-[8px] font-bold tabular-nums text-cyan-400/70 shrink-0">
          {items.length} active
        </span>
      </div>

      {/* Scan funnel strip */}
      {snapshot && (
        <div className="shrink-0 flex items-center gap-0 border-b border-border/15 bg-surface/8">
          <FunnelCell label="Scanned" value={snapshot.assetsScanned} />
          <FunnelSep />
          <FunnelCell label="Stage 1" value={snapshot.passedStage1} />
          <FunnelSep />
          <FunnelCell label="Stage 2" value={snapshot.passedStage2} />
          <FunnelSep />
          <FunnelCell label="Deep" value={snapshot.deepDived} />
          <FunnelSep />
          <FunnelCell label="DQ" value={snapshot.disqualified} accent="text-bearish/60" />
          {snapshot.filteredByGates != null && (
            <>
              <FunnelSep />
              <FunnelCell label="Gated" value={snapshot.filteredByGates} accent="text-amber-400/60" />
            </>
          )}
        </div>
      )}

      {/* Cards area — scrollable */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[120px]">
            <p className="font-mono-data text-[9px] text-muted-foreground/40 uppercase tracking-wider">
              No active opportunities
            </p>
          </div>
        ) : (
          items.map((item) => (
            <OpportunityCard key={item.id} item={item} />
          ))
        )}
      </div>
    </div>
  );
}

function FunnelCell({ label, value, accent }: { label: string; value: number | null; accent?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center py-1.5 px-1">
      <span className={cn('font-mono-data text-[11px] font-bold tabular-nums', accent || 'text-foreground/75')}>
        {value ?? '—'}
      </span>
      <span className="font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/45 mt-0.5">
        {label}
      </span>
    </div>
  );
}

function FunnelSep() {
  return <div className="w-px h-6 bg-border/20 shrink-0" aria-hidden="true" />;
}

function OpportunityCard({ item }: { item: OpportunityItem }) {
  const [expanded, setExpanded] = useState(false);
  const score = item.finalScore ?? 0;
  const isHigh = score >= 220;
  const isLong = item.direction === 'LONG';
  const sm = item.smartMoney as Record<string, number> | null;
  const funding = item.funding as Record<string, unknown> | null;

  return (
    <div className={cn(
      'rounded-lg border overflow-hidden transition-all duration-200',
      isHigh
        ? 'border-bullish/25 bg-bullish/5 hover:border-bullish/40'
        : 'border-border/30 bg-card/40 hover:border-primary/30 hover:bg-surface/40'
    )}>
      {/* Compact header — always visible */}
      <a
        href="https://app.hyperliquid.xyz/trade"
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-2 px-2.5 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Asset */}
        <span className="font-mono-data text-[13px] font-bold text-foreground/90 tracking-tight w-[60px] shrink-0 truncate">
          {item.asset}
        </span>

        {/* Direction */}
        <span className={cn(
          'shrink-0 rounded border px-1.5 py-px font-mono-data text-[8px] font-bold uppercase tracking-wider',
          isLong ? 'border-bullish/40 bg-bullish/10 text-bullish' : 'border-bearish/40 bg-bearish/10 text-bearish'
        )}>
          {item.direction ?? '—'}
        </span>

        {/* Score */}
        <span className={cn(
          'shrink-0 rounded border px-1.5 py-px font-mono-data text-[9px] font-bold tabular-nums',
          isHigh ? 'border-bullish/40 bg-bullish/8 text-bullish' : 'border-primary/30 bg-primary/8 text-primary'
        )}>
          {score}
        </span>

        {/* Leverage */}
        {item.leverage && (
          <span className="shrink-0 rounded border border-border/25 bg-surface/20 px-1 py-px font-mono-data text-[7px] font-bold text-muted-foreground/60">
            {item.leverage}x
          </span>
        )}

        {/* Streak + trend inline */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="font-mono-data text-[8px] text-muted-foreground/45 tabular-nums whitespace-nowrap">
            ×{item.scanStreak ?? 0}
          </span>
          {item.scoreDelta !== null && item.scoreDelta !== undefined && (
            <span className={cn(
              'font-mono-data text-[8px] tabular-nums whitespace-nowrap',
              item.scoreDelta >= 0 ? 'text-bullish/70' : 'text-bearish/70'
            )}>
              {item.scoreDelta >= 0 ? '+' : ''}{item.scoreDelta}
            </span>
          )}
          {item.hourlyTrend && (
            <span className={cn(
              'font-mono-data text-[7px] font-bold uppercase',
              item.hourlyTrend === 'UP' ? 'text-bullish/70' : item.hourlyTrend === 'DOWN' ? 'text-bearish/70' : 'text-muted-foreground/40'
            )}>
              {item.hourlyTrend}
            </span>
          )}
          {item.trendAligned && (
            <span className="font-mono-data text-[7px] text-bullish/60 font-bold">✓</span>
          )}
        </div>

        {/* Link icon */}
        <ArrowUpRight className="shrink-0 h-3 w-3 text-muted-foreground/25 group-hover:text-primary/60 transition-colors" />
      </a>

      {/* Pillar bar — always visible below header */}
      <div className="px-2.5 pb-1.5">
        <PillarBar scores={item.pillarScores as { smartMoney?: number; marketStructure?: number; technicals?: number; funding?: number } | null} />
      </div>

      {/* Risks inline */}
      {item.risks.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2.5 pb-1.5">
          {item.risks.slice(0, 3).map((risk, i) => (
            <span key={i} className="rounded border border-bearish/20 bg-bearish/6 px-1 py-px font-mono-data text-[7px] text-bearish/70">
              {risk}
            </span>
          ))}
          {item.risks.length > 3 && (
            <span className="rounded border border-border/20 bg-surface/15 px-1 py-px font-mono-data text-[7px] text-muted-foreground/45">
              +{item.risks.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Expand/collapse toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-center gap-1 border-t border-border/15 py-1 text-muted-foreground/35 hover:text-muted-foreground/60 transition-colors"
      >
        <span className="font-mono-data text-[7px] uppercase tracking-wider">
          {expanded ? 'Less' : 'Technicals + SM'}
        </span>
        {expanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
      </button>

      {/* Expandable details */}
      {expanded && (
        <div className="border-t border-border/15 p-2.5 space-y-2.5">
          {/* Smart Money */}
          {sm && (
            <div>
              <div className="font-mono-data text-[7px] uppercase tracking-[0.18em] text-muted-foreground/45 mb-1">Smart Money</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {sm.traders !== undefined && <SmStat label="Traders" value={String(sm.traders)} />}
                {sm.pnlPct !== undefined && <SmStat label="PnL" value={`${Number(sm.pnlPct).toFixed(1)}%`} />}
                {sm.accel !== undefined && <SmStat label="Accel" value={Number(sm.accel).toFixed(2)} />}
                {sm.direction !== undefined && <SmStat label="Dir" value={String(sm.direction)} />}
              </div>
            </div>
          )}

          {/* Funding */}
          {funding && (
            <div>
              <div className="font-mono-data text-[7px] uppercase tracking-[0.18em] text-muted-foreground/45 mb-1">Funding</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {funding.rate !== undefined && <SmStat label="Rate" value={`${(Number(funding.rate) * 100).toFixed(4)}%`} />}
                {funding.annualized !== undefined && <SmStat label="Ann" value={`${Number(funding.annualized).toFixed(1)}%`} />}
                {funding.favorable !== undefined && (
                  <span className={cn('font-mono-data text-[8px] font-bold uppercase', funding.favorable ? 'text-bullish' : 'text-bearish')}>
                    {funding.favorable ? 'Favorable' : 'Unfavorable'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Technicals */}
          <div>
            <div className="font-mono-data text-[7px] uppercase tracking-[0.18em] text-muted-foreground/45 mb-1.5">Technicals</div>
            <TechnicalsGrid data={item.technicals as Parameters<typeof TechnicalsGrid>[0]['data']} />
          </div>
        </div>
      )}
    </div>
  );
}

function SmStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono-data text-[7px] text-muted-foreground/40 uppercase">{label}</span>
      <span className="font-mono-data text-[9px] font-bold text-foreground/70 tabular-nums">{value}</span>
    </div>
  );
}
