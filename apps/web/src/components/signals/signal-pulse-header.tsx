'use client';

import { cn } from '@/lib/utils';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';

interface BtcContext {
  trend?: string;
  trend4h?: string;
  change1h?: number;
  change24h?: number;
  price?: number;
}

interface PulseHeaderProps {
  oppScanTime: string | null;
  emergingScanTime: string | null;
  whaleScanTime: string | null;
  btcContext: BtcContext | null;
  oppCount: number;
  emergingCount: number;
  whaleCount: number;
  hasImmediate: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SignalPulseHeader({
  oppScanTime,
  emergingScanTime,
  whaleScanTime,
  btcContext,
  oppCount,
  emergingCount,
  whaleCount,
  hasImmediate,
}: PulseHeaderProps) {
  const btcTrend = btcContext?.trend;
  const btcTrend4h = btcContext?.trend4h;
  const btcChg = btcContext?.change1h;

  return (
    <div className="rounded-lg border border-border/30 bg-card/60 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 px-3 py-1.5">

        {/* Status beacon */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Activity className="w-3.5 h-3.5 text-primary/70" />
            <span
              className={cn(
                'absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full',
                hasImmediate ? 'bg-bearish animate-pulse' : 'bg-bullish'
              )}
            />
          </div>
          <span className="font-mono-data text-[9px] font-bold uppercase tracking-[0.2em] text-foreground/70">
            noon / intelligence
          </span>
        </div>

        {/* Separator */}
        <div className="h-3 w-px bg-border/30" aria-hidden="true" />

        {/* Counts */}
        <div className="flex items-center gap-2.5">
          <CountBadge label="OPP" count={oppCount} color="text-cyan-400" dotColor="bg-cyan-400" />
          <CountBadge label="EMG" count={emergingCount} color="text-amber-400" dotColor="bg-amber-400" />
          <CountBadge label="WHL" count={whaleCount} color="text-violet-400" dotColor="bg-violet-400" />
        </div>

        {/* Separator */}
        <div className="h-3 w-px bg-border/30" aria-hidden="true" />

        {/* BTC Context */}
        {btcContext && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono-data text-[8px] uppercase tracking-wider text-muted-foreground/45">BTC</span>
            {/* 1H trend */}
            <span className={cn(
              'font-mono-data text-[9px] font-bold uppercase tracking-wide',
              btcTrend === 'UP' || btcTrend === 'strong_up' ? 'text-bullish' :
              btcTrend === 'DOWN' || btcTrend === 'strong_down' ? 'text-bearish' :
              'text-muted-foreground/60'
            )}>
              {btcTrend ?? '—'}
            </span>
            {/* 4H trend indicator */}
            {btcTrend4h && (
              <>
                <span className="font-mono-data text-[7px] text-muted-foreground/30">·</span>
                <span className="font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/35">4H</span>
                <span className={cn(
                  'font-mono-data text-[8px] font-bold uppercase',
                  btcTrend4h === 'UP' ? 'text-bullish/70' :
                  btcTrend4h === 'DOWN' ? 'text-bearish/70' :
                  'text-muted-foreground/40'
                )}>
                  {btcTrend4h}
                </span>
              </>
            )}
            {btcChg !== undefined && btcChg !== null && (
              <span className={cn(
                'font-mono-data text-[9px] font-semibold tabular-nums flex items-center gap-0.5',
                btcChg >= 0 ? 'text-bullish' : 'text-bearish'
              )}>
                {btcChg >= 0 ? <TrendingUp className="h-2 w-2" /> : <TrendingDown className="h-2 w-2" />}
                {btcChg >= 0 ? '+' : ''}{btcChg.toFixed(2)}%
              </span>
            )}
          </div>
        )}

        {/* Scan times — pushed right */}
        <div className="ml-auto flex items-center gap-2.5">
          {oppScanTime && <ScanTime label="OPP" time={formatTime(oppScanTime)} />}
          {emergingScanTime && <ScanTime label="EMG" time={formatTime(emergingScanTime)} />}
          {whaleScanTime && <ScanTime label="WHL" time={formatTime(whaleScanTime)} />}
        </div>
      </div>
    </div>
  );
}

function CountBadge({
  label,
  count,
  color,
  dotColor,
}: {
  label: string;
  count: number;
  color: string;
  dotColor: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dotColor, 'opacity-70')} />
      <span className={cn('font-mono-data text-[8px] font-bold uppercase tracking-wider', color)}>{label}</span>
      <span className="font-mono-data text-[11px] font-bold tabular-nums text-foreground/80">{count}</span>
    </div>
  );
}

function ScanTime({ label, time }: { label: string; time: string }) {
  return (
    <span className="font-mono-data text-[8px] text-muted-foreground/40 tabular-nums">
      {label} <span className="text-muted-foreground/55">{time}</span>
    </span>
  );
}
