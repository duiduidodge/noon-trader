'use client';

import { cn } from '@/lib/utils';
import { Radio, ExternalLink } from 'lucide-react';
import { RankSparkline } from './rank-sparkline';

interface EmergingAlert {
  id: string;
  signal: string;
  direction: string | null;
  currentRank: number | null;
  contribution: number | null;
  contribVelocity: number | null;
  traders: number | null;
  priceChg4h: number | null;
  reasonCount: number;
  reasons: string[];
  isImmediate: boolean;
  isDeepClimber: boolean;
  erratic: boolean;
  lowVelocity: boolean;
  rankHistory: number[] | null;
  contribHistory: number[] | null;
}

interface EmergingSnapshot {
  status: string;
  hasImmediate: boolean;
  hasEmergingMover: boolean;
  hasDeepClimber: boolean;
  totalMarkets: number | null;
  scansInHistory: number | null;
}

interface Props {
  snapshot: EmergingSnapshot | null;
  alerts: EmergingAlert[];
}

export function EmergingSection({ snapshot, alerts }: Props) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Column header */}
      <div className="shrink-0 flex items-center gap-2 border-b border-border/25 bg-surface/15 px-3 py-2">
        <div className="relative shrink-0">
          <Radio className="w-3 h-3 text-amber-400/70" aria-hidden="true" />
          {snapshot?.hasImmediate && (
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-bearish animate-pulse" />
          )}
        </div>
        <span className="font-mono-data text-[9px] font-bold uppercase tracking-[0.2em] text-foreground/75">
          Emerging Movers
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-amber-400/20 to-transparent" aria-hidden="true" />
        <span className="font-mono-data text-[8px] font-bold tabular-nums text-amber-400/70 shrink-0">
          {alerts.length} alerts
        </span>
      </div>

      {/* Snapshot status strip */}
      {snapshot && (
        <div className="shrink-0 flex items-center gap-3 border-b border-border/15 bg-surface/8 px-3 py-1.5">
          <div className="flex items-center gap-1">
            <span className="font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/40">Markets</span>
            <span className="font-mono-data text-[9px] font-bold text-foreground/65 tabular-nums">{snapshot.totalMarkets ?? '—'}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/40">History</span>
            <span className="font-mono-data text-[9px] font-bold text-foreground/65 tabular-nums">{snapshot.scansInHistory ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <StatusDot active={snapshot.hasImmediate} label="IMM" color="bg-bearish" />
            <StatusDot active={snapshot.hasEmergingMover} label="EMG" color="bg-amber-400" />
            <StatusDot active={snapshot.hasDeepClimber} label="DEEP" color="bg-primary" />
          </div>
        </div>
      )}

      {/* Alert rows — scrollable */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
        {alerts.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[120px]">
            <p className="font-mono-data text-[9px] text-muted-foreground/40 uppercase tracking-wider">
              No emerging mover alerts
            </p>
          </div>
        ) : (
          alerts.map((alert) => (
            <EmergingRow key={alert.id} alert={alert} />
          ))
        )}
      </div>
    </div>
  );
}

function StatusDot({ active, label, color }: { active: boolean; label: string; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', active ? color : 'bg-muted-foreground/20')} />
      <span className={cn('font-mono-data text-[7px] uppercase tracking-wider', active ? 'text-foreground/60' : 'text-muted-foreground/30')}>
        {label}
      </span>
    </div>
  );
}

function EmergingRow({ alert }: { alert: EmergingAlert }) {
  const vel = alert.contribVelocity ?? 0;
  const chg = alert.priceChg4h ?? 0;

  return (
    <a
      href="https://app.hyperliquid.xyz/trade"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex flex-col gap-1.5 rounded-lg border px-2.5 py-2 transition-all duration-200',
        alert.isImmediate
          ? 'border-bearish/25 bg-bearish/5 hover:border-bearish/40'
          : 'border-border/30 bg-card/40 hover:border-primary/30 hover:bg-surface/40'
      )}
    >
      {/* Row 1: Signal name + type badges + link */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Signal name */}
        <span className="font-mono-data text-[12px] font-bold text-foreground/90 tracking-tight shrink-0">
          {alert.signal}
        </span>

        {/* Type badges */}
        {alert.isImmediate && (
          <span className="shrink-0 rounded border border-bearish/40 bg-bearish/10 px-1 py-px font-mono-data text-[7px] font-bold uppercase tracking-wider text-bearish">
            IMM
          </span>
        )}
        {alert.isDeepClimber && (
          <span className="shrink-0 rounded border border-primary/35 bg-primary/8 px-1 py-px font-mono-data text-[7px] font-bold uppercase tracking-wider text-primary">
            DEEP
          </span>
        )}
        {alert.erratic && (
          <span className="shrink-0 rounded border border-orange-400/30 bg-orange-400/8 px-1 py-px font-mono-data text-[7px] font-bold uppercase tracking-wider text-orange-400/75">
            ERT
          </span>
        )}
        {alert.lowVelocity && (
          <span className="shrink-0 rounded border border-muted-foreground/20 bg-surface/20 px-1 py-px font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/50">
            LV
          </span>
        )}

        <ExternalLink className="ml-auto h-2.5 w-2.5 shrink-0 text-muted-foreground/25 group-hover:text-primary/60 transition-colors" />
      </div>

      {/* Row 2: Stats inline */}
      <div className="flex items-center gap-3">
        {/* Rank + sparkline */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono-data text-[8px] text-muted-foreground/40 uppercase">Rank</span>
          <span className="font-mono-data text-[11px] font-bold tabular-nums text-foreground/80">
            #{alert.currentRank ?? '—'}
          </span>
          <RankSparkline data={alert.rankHistory} inverted />
        </div>

        <div className="h-3 w-px bg-border/20" aria-hidden="true" />

        {/* SM% + sparkline */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono-data text-[8px] text-muted-foreground/40 uppercase">SM%</span>
          <span className="font-mono-data text-[11px] font-bold tabular-nums text-foreground/80">
            {alert.contribution?.toFixed(1) ?? '—'}%
          </span>
          <RankSparkline data={alert.contribHistory} inverted={false} />
        </div>

        <div className="h-3 w-px bg-border/20" aria-hidden="true" />

        {/* Velocity */}
        <div className="flex items-center gap-1">
          <span className="font-mono-data text-[8px] text-muted-foreground/40 uppercase">Vel</span>
          <span className={cn(
            'font-mono-data text-[10px] font-bold tabular-nums',
            vel >= 0.05 ? 'text-bullish' : 'text-foreground/60'
          )}>
            {alert.contribVelocity?.toFixed(3) ?? '—'}
          </span>
        </div>

        <div className="h-3 w-px bg-border/20" aria-hidden="true" />

        {/* 4h change */}
        <div className="flex items-center gap-1">
          <span className="font-mono-data text-[8px] text-muted-foreground/40 uppercase">4h</span>
          <span className={cn(
            'font-mono-data text-[10px] font-bold tabular-nums',
            chg >= 0 ? 'text-bullish' : 'text-bearish'
          )}>
            {alert.priceChg4h !== null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%` : '—'}
          </span>
        </div>

        {/* Traders */}
        {alert.traders !== null && (
          <>
            <div className="h-3 w-px bg-border/20" aria-hidden="true" />
            <div className="flex items-center gap-1">
              <span className="font-mono-data text-[8px] text-muted-foreground/40 uppercase">T</span>
              <span className="font-mono-data text-[10px] font-bold tabular-nums text-foreground/60">{alert.traders}</span>
            </div>
          </>
        )}
      </div>

      {/* Row 3: Reason tags (compact) */}
      {alert.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {alert.reasons.slice(0, 4).map((reason, i) => (
            <span key={i} className="rounded border border-border/20 bg-surface/20 px-1 py-px font-mono-data text-[7px] text-muted-foreground/60">
              {reason}
            </span>
          ))}
          {alert.reasons.length > 4 && (
            <span className="font-mono-data text-[7px] text-muted-foreground/35">
              +{alert.reasons.length - 4}
            </span>
          )}
        </div>
      )}
    </a>
  );
}
