'use client';

import { useEffect } from 'react';
import { X, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RankSparkline } from './rank-sparkline';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreBreakdown {
  base: number;
  trendBonus: number;
  emergingBonus: number;
  whaleBonus: number;
}

interface OpportunityDetail {
  finalScore: number;
  scanStreak: number | null;
  hourlyTrend: string | null;
  trendAligned: boolean;
  leverage: number | null;
  pillarScores: Record<string, number> | null;
  smartMoney: Record<string, unknown> | null;
  technicals: Record<string, unknown> | null;
  funding: Record<string, unknown> | null;
  risks: string[];
  exitLevels: Record<string, unknown> | null;
  positionSize: Record<string, unknown> | null;
}

interface EmergingDetail {
  currentRank: number | null;
  contribution: number | null;
  contribVelocity: number | null;
  priceChg4h: number | null;
  traders: number | null;
  reasons: string[];
  isImmediate: boolean;
  isDeepClimber: boolean;
  erratic: boolean;
  lowVelocity: boolean;
  rankHistory: number[] | null;
  contribHistory: number[] | null;
  reasonCount: number;
}

export interface SetupDetailItem {
  id: string;
  asset: string;
  direction: string;
  confidence: number;
  thesis: string;
  scoreBreakdown?: ScoreBreakdown;
  opportunity?: OpportunityDetail | null;
  emerging?: EmergingDetail | null;
  whaleTopScore?: number | null;
}

interface Props {
  setup: SetupDetailItem;
  onClose: () => void;
}

// ─── Plain-language helpers ───────────────────────────────────────────────────

function rsiLabel(rsi: number, direction: string): { text: string; color: string } {
  if (direction === 'LONG') {
    if (rsi < 30) return { text: 'Deeply oversold — reversal bounce expected', color: 'text-bullish' };
    if (rsi < 45) return { text: 'Mildly oversold — good long entry zone', color: 'text-bullish' };
    if (rsi < 65) return { text: 'Healthy momentum zone', color: 'text-yellow-400' };
    if (rsi < 75) return { text: 'Strong momentum — watch for pullback', color: 'text-yellow-400' };
    return { text: 'Overbought — elevated risk for longs', color: 'text-bearish' };
  } else {
    if (rsi > 75) return { text: 'Overbought — good short entry zone', color: 'text-bullish' };
    if (rsi > 60) return { text: 'Elevated — potential short setup', color: 'text-yellow-400' };
    if (rsi > 40) return { text: 'Mid-range — neutral for shorts', color: 'text-yellow-400' };
    return { text: 'Oversold — risky for shorts', color: 'text-bearish' };
  }
}

function fundingLabel(rate: number, direction: string): { text: string; color: string } {
  if (direction === 'LONG') {
    if (rate < -0.0002) return { text: 'Shorts funding longs — strong carry', color: 'text-bullish' };
    if (rate < 0) return { text: 'Negative funding — longs earn carry', color: 'text-bullish' };
    if (rate < 0.0003) return { text: 'Near-zero — negligible cost', color: 'text-yellow-400' };
    if (rate < 0.001) return { text: 'Small cost to hold long', color: 'text-yellow-400' };
    return { text: 'High funding cost — carry risk for longs', color: 'text-bearish' };
  } else {
    if (rate > 0.0002) return { text: 'Longs funding shorts — strong carry', color: 'text-bullish' };
    if (rate > 0) return { text: 'Positive funding — shorts earn carry', color: 'text-bullish' };
    if (rate > -0.0003) return { text: 'Near-zero — negligible cost', color: 'text-yellow-400' };
    return { text: 'Negative funding — carry risk for shorts', color: 'text-bearish' };
  }
}

function volumeLabel(ratio: number): { text: string; color: string } {
  if (ratio >= 3) return { text: `${ratio.toFixed(1)}× avg — strong breakout`, color: 'text-bullish' };
  if (ratio >= 2) return { text: `${ratio.toFixed(1)}× avg — elevated activity`, color: 'text-bullish' };
  if (ratio >= 1.3) return { text: `${ratio.toFixed(1)}× avg — above normal`, color: 'text-yellow-400' };
  if (ratio >= 0.7) return { text: `${ratio.toFixed(1)}× avg — normal`, color: 'text-muted-foreground/70' };
  return { text: `${ratio.toFixed(1)}× avg — below average`, color: 'text-bearish' };
}

function smLabel(pnlPct: number | undefined, accel: number | undefined): string {
  if (pnlPct === undefined) return 'Smart money positioning unavailable';
  if (pnlPct > 15) return `SM +${pnlPct.toFixed(1)}% — highly profitable`;
  if (pnlPct > 5) return `SM +${pnlPct.toFixed(1)}% — positive conviction`;
  if (pnlPct > 0) return `SM +${pnlPct.toFixed(1)}% — slightly positive`;
  if (pnlPct > -5) return `SM ${pnlPct.toFixed(1)}% — slightly underwater`;
  return `SM ${Math.abs(pnlPct).toFixed(1)}% — contrarian signal`;
}

function trendLabel(trend: string | null | undefined): { text: string; color: string } {
  if (trend === 'UP') return { text: 'Uptrend on 4h (above EMA20 & EMA50)', color: 'text-bullish' };
  if (trend === 'DOWN') return { text: 'Downtrend on 4h (below both EMAs)', color: 'text-bearish' };
  return { text: 'Sideways — no clear 4h trend', color: 'text-muted-foreground/60' };
}

function trend1hLabel(trend: string | null | undefined): { text: string; color: string } {
  if (trend === 'UP') return { text: 'Uptrend on 1h (EMA9 > EMA21) — both TFs aligned', color: 'text-bullish' };
  if (trend === 'DOWN') return { text: 'Downtrend on 1h (EMA9 < EMA21) — both TFs aligned', color: 'text-bearish' };
  return { text: 'Sideways on 1h — no EMA trend confirmation', color: 'text-muted-foreground/60' };
}

function velocityLabel(vel: number | null): { text: string; color: string } {
  if (vel === null) return { text: '—', color: 'text-muted-foreground/50' };
  if (vel >= 0.5) return { text: 'Accelerating rapidly', color: 'text-bullish' };
  if (vel >= 0.1) return { text: 'Gaining momentum', color: 'text-bullish' };
  if (vel >= 0.01) return { text: 'Slowly building', color: 'text-yellow-400' };
  return { text: 'Low velocity', color: 'text-muted-foreground/50' };
}

function fmtPx(v: number): string {
  if (v >= 10000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

function regimeStyle(regime: string | undefined): { label: string; cls: string } {
  if (regime === 'TRENDING') return { label: 'TRENDING', cls: 'border-bullish/35 bg-bullish/8 text-bullish' };
  if (regime === 'RANGING') return { label: 'RANGING', cls: 'border-yellow-400/35 bg-yellow-400/8 text-yellow-400' };
  if (regime === 'VOLATILE') return { label: 'VOLATILE', cls: 'border-orange-400/35 bg-orange-400/8 text-orange-400' };
  return { label: '—', cls: 'border-border/20 bg-surface/15 text-muted-foreground/50' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Compact 4-chip confidence breakdown
function ConfidenceChips({ breakdown, total }: { breakdown: ScoreBreakdown; total: number }) {
  const chips = [
    { label: 'BASE', value: breakdown.base, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/25' },
    { label: 'TREND', value: breakdown.trendBonus, color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/25' },
    { label: 'EMG', value: breakdown.emergingBonus, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/25' },
    { label: 'WHALE', value: breakdown.whaleBonus, color: 'text-violet-400', bg: 'bg-violet-400/10', border: 'border-violet-400/25' },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1.5">
        {chips.map((chip) => (
          <div
            key={chip.label}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-lg border py-2 px-1',
              chip.bg, chip.border,
              chip.value === 0 && 'opacity-30'
            )}
          >
            <span className={cn('font-mono-data text-[7px] font-bold uppercase tracking-[0.1em]', chip.color)}>
              {chip.label}
            </span>
            <span className={cn('font-mono-data text-[15px] font-bold tabular-nums leading-none', chip.color)}>
              {chip.value > 0 && chip.label !== 'BASE' ? `+${chip.value}` : chip.value}
            </span>
          </div>
        ))}
      </div>
      {/* Stacked progress bar */}
      <div className="space-y-1">
        <div className="flex h-1 rounded-full overflow-hidden bg-surface/40">
          <div className="bg-primary/70 transition-all" style={{ width: `${(breakdown.base / 99) * 100}%` }} />
          <div className="bg-cyan-400/70 transition-all" style={{ width: `${(breakdown.trendBonus / 99) * 100}%` }} />
          <div className="bg-amber-400/70 transition-all" style={{ width: `${(breakdown.emergingBonus / 99) * 100}%` }} />
          <div className="bg-violet-400/70 transition-all" style={{ width: `${(breakdown.whaleBonus / 99) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono-data text-[8px] text-muted-foreground/40 uppercase tracking-wider">Total</span>
          <span className="font-mono-data text-[12px] font-bold text-foreground/85 tabular-nums">{total} / 99</span>
        </div>
      </div>
    </div>
  );
}

// Compact pillar bar
function PillarRow({ label, score, color, barColor, max = 100 }: {
  label: string; score: number; color: string; barColor: string; max?: number;
}) {
  const filled = Math.round(Math.min(100, Math.max(0, (score / max) * 100)) / 10);
  const empty = 10 - filled;
  return (
    <div className="flex items-center gap-2">
      <span className={cn('font-mono-data text-[9px] font-bold uppercase tracking-wider w-22 shrink-0', color)}>
        {label}
      </span>
      <div className="flex-1 flex items-center gap-px">
        {Array.from({ length: filled }).map((_, i) => (
          <div key={`f-${i}`} className={cn('h-1.5 flex-1 rounded-sm', barColor)} />
        ))}
        {Array.from({ length: empty }).map((_, i) => (
          <div key={`e-${i}`} className="h-1.5 flex-1 rounded-sm bg-surface/50 border border-border/20" />
        ))}
      </div>
      <span className="font-mono-data text-[12px] font-bold tabular-nums text-foreground/80 w-7 text-right shrink-0">
        {score}
      </span>
    </div>
  );
}

// Single-line signal reading: label | value | description
function ReadingLine({ label, value, valueClass, description }: {
  label: string; value: string; valueClass?: string; description: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/10 last:border-0">
      <span className="font-mono-data text-[8px] uppercase tracking-wider text-muted-foreground/40 w-[68px] shrink-0">
        {label}
      </span>
      <span className={cn('font-mono-data text-[11px] font-bold tabular-nums w-14 shrink-0', valueClass || 'text-foreground/80')}>
        {value}
      </span>
      <span className="font-mono-data text-[9px] text-muted-foreground/55 leading-tight min-w-0 truncate">
        {description}
      </span>
    </div>
  );
}

// Compact note row
function ReadingNote({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[9px]">{icon}</span>
      <p className="font-mono-data text-[9px] text-muted-foreground/55 leading-tight">{text}</p>
    </div>
  );
}

// Small stat tile
function MiniStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/20 bg-surface/15 px-2 py-1.5">
      <div className="font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/40 mb-0.5">{label}</div>
      {children}
    </div>
  );
}

// ─── TradingView Chart Embed ──────────────────────────────────────────────────

function ChartEmbed({ asset }: { asset: string }) {
  // Use Binance perp symbol; TradingView falls back gracefully if not found
  const symbol = `BINANCE:${asset}USDT.P`;
  const params = new URLSearchParams({
    hideideas: '1',
    symbol,
    interval: '240',
    hidesidetoolbar: '1',
    hidetoptoolbar: '1',
    symboledit: '0',
    saveimage: '0',
    toolbarsaveimage: '0',
    theme: 'dark',
    style: '1',
    timezone: 'exchange',
    locale: 'en',
    hide_legend: '1',
    backgroundColor: 'rgba(0,0,0,0)',
    gridColor: 'rgba(255,255,255,0.04)',
  });

  return (
    <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-border/20 bg-black/30">
      <iframe
        key={asset}
        src={`https://www.tradingview.com/widgetembed/?${params.toString()}`}
        width="100%"
        height="100%"
        frameBorder="0"
        scrolling="no"
        title={`${asset} 4H chart`}
        className="block w-full h-full"
        allow="fullscreen"
      />
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function SetupDetailModal({ setup, onClose }: Props) {
  const isLong = setup.direction === 'LONG';
  const opp = setup.opportunity ?? null;
  const emg = setup.emerging ?? null;
  const tech = opp?.technicals as Record<string, unknown> | null ?? null;
  const funding = opp?.funding as Record<string, unknown> | null ?? null;
  const sm = opp?.smartMoney as Record<string, unknown> | null ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const rsi1h = tech?.rsi1h as number | undefined;
  const volRatio = tech?.volRatio1h as number | undefined;
  const trend4h = tech?.trend4h as string | undefined;
  const trend1h = tech?.trend1h as string | undefined;
  const pivots = tech?.pivots as { pp?: number; s1?: number; r1?: number; s2?: number; r2?: number } | null | undefined;
  const fundingRate = funding?.rate as number | undefined;
  const annualized = funding?.annualized as number | undefined;
  const favorable = funding?.favorable as boolean | undefined;
  const pnlPct = sm?.pnlPct as number | undefined;
  const accel = sm?.accel as number | undefined;
  const chg1h = tech?.chg1h as number | undefined;
  const chg4h = tech?.chg4h as number | undefined;
  const regime = tech?.regime as string | undefined;
  const adx4h = tech?.adx4h as number | undefined;
  const exitLevels = opp?.exitLevels as {
    initialSL?: number; trailingSLPct?: number; tp1?: number; tp2?: number; maxHoldHours?: number; riskPct?: number;
  } | null ?? null;
  const positionSize = opp?.positionSize as {
    riskPct?: number; positionPct?: number; dollarRisk10k?: number;
  } | null ?? null;
  const regimeInfo = regimeStyle(regime);

  const trendInfo = trendLabel(trend4h);
  const trend1hInfo = trend1hLabel(trend1h);
  const rsiInfo = rsi1h !== undefined ? rsiLabel(rsi1h, setup.direction) : null;
  const volInfo = volRatio !== undefined ? volumeLabel(volRatio) : null;
  const fundInfo = fundingRate !== undefined ? fundingLabel(fundingRate, setup.direction) : null;

  const pillarScores = opp?.pillarScores as {
    derivatives?: number; marketStructure?: number; technicals?: number; entryBonus?: number;
  } | null ?? null;

  const DirectionIcon = isLong ? TrendingUp : TrendingDown;
  const hasPillars = pillarScores && (pillarScores.derivatives !== undefined || pillarScores.marketStructure !== undefined);
  const hasSignalReadings = opp && (trend4h !== undefined || trend1h !== undefined || rsiInfo || volInfo || sm || fundInfo);
  // Show chart in right column when there's no opportunity data to fill it
  const showChart = !hasPillars && !hasSignalReadings;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[760px] rounded-xl border border-border/40 bg-card shadow-modal overflow-hidden animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 border-b border-border/25',
          isLong ? 'bg-bullish/5' : 'bg-bearish/5'
        )}>
          <div className={cn('w-0.5 self-stretch rounded-full shrink-0', isLong ? 'bg-bullish' : 'bg-bearish')} />

          {/* Asset */}
          <span className="font-mono-data text-[22px] font-bold text-foreground/95 tracking-tight leading-none">
            {setup.asset}
          </span>

          {/* Direction */}
          <span className={cn(
            'flex items-center gap-1 rounded border px-2 py-0.5 font-mono-data text-[10px] font-bold uppercase tracking-wider shrink-0',
            isLong ? 'border-bullish/45 bg-bullish/12 text-bullish' : 'border-bearish/45 bg-bearish/12 text-bearish'
          )}>
            <DirectionIcon className="h-3 w-3" />
            {setup.direction}
          </span>

          {/* Regime badge */}
          {regime && (
            <span className={cn(
              'rounded border px-2 py-0.5 font-mono-data text-[9px] font-bold uppercase tracking-wider shrink-0',
              regimeInfo.cls
            )}>
              {regimeInfo.label}
              {adx4h !== undefined && <span className="opacity-60 ml-1">ADX {Math.round(adx4h)}</span>}
            </span>
          )}

          {/* Confidence */}
          <div className="flex flex-col items-center shrink-0">
            <span className="font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/40">Score</span>
            <span className={cn(
              'font-mono-data text-[18px] font-bold tabular-nums leading-none',
              setup.confidence >= 80 ? 'text-bullish' : 'text-primary'
            )}>
              {setup.confidence}
            </span>
          </div>

          {/* Leverage */}
          {opp?.leverage && (
            <div className="flex flex-col items-center shrink-0">
              <span className="font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/40">Lev</span>
              <span className="font-mono-data text-[13px] font-bold text-muted-foreground/65">{opp.leverage}×</span>
            </div>
          )}

          {/* Quick meta pills */}
          <div className="flex items-center gap-1.5 ml-1 flex-wrap">
            {opp?.scanStreak != null && (
              <span className="rounded border border-border/25 bg-surface/20 px-1.5 py-px font-mono-data text-[8px] text-muted-foreground/55">
                streak ×{opp.scanStreak}
              </span>
            )}
            {opp?.hourlyTrend && (
              <span className={cn(
                'rounded border px-1.5 py-px font-mono-data text-[8px] font-bold',
                opp.hourlyTrend === 'UP' ? 'border-bullish/30 bg-bullish/8 text-bullish' :
                opp.hourlyTrend === 'DOWN' ? 'border-bearish/30 bg-bearish/8 text-bearish' :
                'border-border/20 bg-surface/15 text-muted-foreground/50'
              )}>
                {opp.hourlyTrend}
              </span>
            )}
            {chg1h !== undefined && (
              <span className={cn('font-mono-data text-[9px] font-bold tabular-nums', chg1h >= 0 ? 'text-bullish' : 'text-bearish')}>
                1h {chg1h >= 0 ? '+' : ''}{chg1h.toFixed(1)}%
              </span>
            )}
            {chg4h !== undefined && (
              <span className={cn('font-mono-data text-[9px] font-bold tabular-nums', chg4h >= 0 ? 'text-bullish' : 'text-bearish')}>
                4h {chg4h >= 0 ? '+' : ''}{chg4h.toFixed(1)}%
              </span>
            )}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            className="ml-auto shrink-0 rounded border border-border/30 bg-surface/15 p-1.5 text-muted-foreground/50 hover:border-border/60 hover:text-foreground/80 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ── Thesis ── */}
        <div className="px-4 py-2 border-b border-border/15 bg-surface/8">
          <p className="font-mono-data text-[10px] text-muted-foreground/65 leading-relaxed border-l-2 border-primary/25 pl-3 truncate">
            {setup.thesis}
          </p>
        </div>

        {/* ── Body: 2-column layout ── */}
        <div className={cn('grid grid-cols-2 gap-0 divide-x divide-border/15', showChart && 'min-h-[320px]')}>

          {/* ── LEFT column ── */}
          <div className="px-4 py-3 space-y-4">

            {/* Confidence Breakdown */}
            {setup.scoreBreakdown && (
              <div className="space-y-2">
                <span className="font-mono-data text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">
                  Confidence Breakdown
                </span>
                <ConfidenceChips breakdown={setup.scoreBreakdown} total={setup.confidence} />
                {(setup.scoreBreakdown.trendBonus > 0 ||
                  setup.scoreBreakdown.emergingBonus > 0 ||
                  setup.scoreBreakdown.whaleBonus > 0) && (
                  <div className="space-y-1 pt-0.5">
                    {setup.scoreBreakdown.trendBonus > 0 && (
                      <ReadingNote icon="✓" text="4h trend aligned — reduces false signal risk" />
                    )}
                    {setup.scoreBreakdown.emergingBonus >= 10 && (
                      <ReadingNote icon="⚡" text="Immediate mover — active accumulation right now" />
                    )}
                    {setup.scoreBreakdown.emergingBonus === 6 && (
                      <ReadingNote icon="↑" text="Deep climber — sustained ranking improvement" />
                    )}
                    {setup.scoreBreakdown.emergingBonus === 3 && (
                      <ReadingNote icon="~" text="Some emerging activity — mild trader interest" />
                    )}
                    {setup.scoreBreakdown.whaleBonus > 0 && (
                      <ReadingNote icon="🐋" text="Whale backdrop active (top score ≥ 80)" />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Emerging Movers */}
            {emg && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono-data text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">
                    Emerging Movers
                  </span>
                  <div className="flex items-center gap-1">
                    {emg.isImmediate && (
                      <span className="rounded border border-bearish/40 bg-bearish/10 px-1 py-px font-mono-data text-[6px] font-bold uppercase tracking-wider text-bearish">IMM</span>
                    )}
                    {emg.isDeepClimber && (
                      <span className="rounded border border-primary/35 bg-primary/8 px-1 py-px font-mono-data text-[6px] font-bold uppercase tracking-wider text-primary">DEEP</span>
                    )}
                    {emg.erratic && (
                      <span className="rounded border border-orange-400/35 bg-orange-400/8 px-1 py-px font-mono-data text-[6px] uppercase tracking-wider text-orange-400/80">ERT</span>
                    )}
                    {emg.lowVelocity && (
                      <span className="rounded border border-muted-foreground/20 bg-surface/20 px-1 py-px font-mono-data text-[6px] uppercase tracking-wider text-muted-foreground/50">LV</span>
                    )}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-1.5">
                  {emg.currentRank !== null && (
                    <MiniStat label="Rank">
                      <div className="flex items-center gap-1">
                        <span className="font-mono-data text-[13px] font-bold text-foreground/85 tabular-nums leading-none">#{emg.currentRank}</span>
                        <RankSparkline data={emg.rankHistory} inverted />
                      </div>
                    </MiniStat>
                  )}
                  {emg.contribution !== null && (
                    <MiniStat label="SM%">
                      <div className="flex items-center gap-1">
                        <span className="font-mono-data text-[13px] font-bold text-foreground/85 tabular-nums leading-none">{emg.contribution.toFixed(1)}%</span>
                        <RankSparkline data={emg.contribHistory} inverted={false} />
                      </div>
                    </MiniStat>
                  )}
                  {emg.contribVelocity !== null && (
                    <MiniStat label="Vel">
                      <span className={cn('font-mono-data text-[13px] font-bold tabular-nums leading-none', velocityLabel(emg.contribVelocity).color)}>
                        {emg.contribVelocity.toFixed(3)}
                      </span>
                    </MiniStat>
                  )}
                  {emg.priceChg4h !== null && (
                    <MiniStat label="4h Price">
                      <span className={cn('font-mono-data text-[13px] font-bold tabular-nums leading-none', emg.priceChg4h >= 0 ? 'text-bullish' : 'text-bearish')}>
                        {emg.priceChg4h >= 0 ? '+' : ''}{emg.priceChg4h.toFixed(1)}%
                      </span>
                    </MiniStat>
                  )}
                  {emg.traders !== null && (
                    <MiniStat label="Traders">
                      <span className="font-mono-data text-[13px] font-bold tabular-nums text-foreground/80 leading-none">{emg.traders}</span>
                    </MiniStat>
                  )}
                  {emg.reasonCount > 0 && (
                    <MiniStat label="Signals">
                      <span className="font-mono-data text-[13px] font-bold tabular-nums text-amber-400 leading-none">{emg.reasonCount}</span>
                    </MiniStat>
                  )}
                </div>

                {/* Reason tags */}
                {emg.reasons.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {emg.reasons.slice(0, 6).map((r, i) => (
                      <span key={i} className="rounded border border-amber-400/20 bg-amber-400/5 px-1.5 py-px font-mono-data text-[7px] text-amber-400/70">
                        {r}
                      </span>
                    ))}
                    {emg.reasons.length > 6 && (
                      <span className="font-mono-data text-[7px] text-muted-foreground/35">+{emg.reasons.length - 6}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Whale backdrop */}
            {setup.whaleTopScore != null && (
              <div className="flex items-center gap-2.5 rounded-lg border border-violet-400/20 bg-violet-400/5 px-3 py-2">
                <span className="font-mono-data text-[8px] uppercase tracking-wider text-violet-400/55 shrink-0">Whale</span>
                <span className={cn(
                  'font-mono-data text-[14px] font-bold tabular-nums shrink-0',
                  setup.whaleTopScore >= 80 ? 'text-bullish' : setup.whaleTopScore >= 60 ? 'text-yellow-400' : 'text-muted-foreground/55'
                )}>
                  {setup.whaleTopScore.toFixed(1)}
                </span>
                <span className="font-mono-data text-[9px] text-muted-foreground/50 leading-tight">
                  {setup.whaleTopScore >= 80
                    ? 'High-performing whale active'
                    : setup.whaleTopScore >= 60
                    ? 'Moderate whale activity'
                    : 'Low whale activity'}
                </span>
              </div>
            )}

            {/* Price context fallback */}
            {!opp && emg?.priceChg4h != null && (
              <div className="flex items-center gap-2">
                <span className="font-mono-data text-[8px] uppercase tracking-wider text-muted-foreground/40">4h Change</span>
                <span className={cn('font-mono-data text-[14px] font-bold tabular-nums', emg.priceChg4h >= 0 ? 'text-bullish' : 'text-bearish')}>
                  {emg.priceChg4h >= 0 ? '+' : ''}{emg.priceChg4h.toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {/* ── RIGHT column ── */}
          <div className={cn('px-4 py-3', showChart ? 'flex flex-col gap-2' : 'space-y-4')}>

            {/* Chart when no opportunity data */}
            {showChart && (
              <>
                <span className="font-mono-data text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40 shrink-0">
                  Price Chart · 4H
                </span>
                <ChartEmbed asset={setup.asset} />
              </>
            )}

            {/* Signal Score — 3-pillar */}
            {hasPillars && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono-data text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">
                    Signal Score
                  </span>
                  <span className="font-mono-data text-[11px] font-bold text-foreground/70 tabular-nums">
                    {opp!.finalScore} / 320
                  </span>
                </div>
                <div className="space-y-2">
                  {pillarScores!.derivatives !== undefined && (
                    <PillarRow label="Derivatives" score={pillarScores!.derivatives} color="text-violet-400" barColor="bg-violet-400/70" />
                  )}
                  {pillarScores!.marketStructure !== undefined && (
                    <PillarRow label="Mkt Structure" score={pillarScores!.marketStructure} color="text-primary" barColor="bg-primary/70" />
                  )}
                  {pillarScores!.technicals !== undefined && (
                    <PillarRow label="Technicals" score={pillarScores!.technicals} color="text-amber-400" barColor="bg-amber-400/70" />
                  )}
                </div>
              </div>
            )}

            {/* Position Size */}
            {positionSize && positionSize.riskPct != null && (
              <div className="space-y-1.5">
                <span className="font-mono-data text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">
                  Position Sizing
                </span>
                <div className="grid grid-cols-3 gap-1">
                  <MiniStat label="Risk">
                    <span className="font-mono-data text-[13px] font-bold tabular-nums text-foreground/80 leading-none">
                      {positionSize.riskPct}%
                    </span>
                  </MiniStat>
                  <MiniStat label="Size">
                    <span className="font-mono-data text-[13px] font-bold tabular-nums text-foreground/80 leading-none">
                      {positionSize.positionPct}%
                    </span>
                  </MiniStat>
                  <MiniStat label="$10k Risk">
                    <span className="font-mono-data text-[13px] font-bold tabular-nums text-foreground/80 leading-none">
                      ${positionSize.dollarRisk10k}
                    </span>
                  </MiniStat>
                </div>
              </div>
            )}

            {/* Signal Readings */}
            {hasSignalReadings && (
              <div className="space-y-1">
                <span className="font-mono-data text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">
                  Signal Readings
                </span>
                <div className="divide-y divide-border/10">
                  {trend4h !== undefined && (
                    <ReadingLine
                      label="4H Trend"
                      value={trend4h ?? '—'}
                      valueClass={trendInfo.color}
                      description={trendInfo.text}
                    />
                  )}
                  {trend1h !== undefined && (
                    <ReadingLine
                      label="1H Trend"
                      value={trend1h ?? '—'}
                      valueClass={trend1hInfo.color}
                      description={trend1hInfo.text}
                    />
                  )}
                  {rsiInfo && rsi1h !== undefined && (
                    <ReadingLine
                      label="RSI 1h"
                      value={rsi1h.toFixed(1)}
                      valueClass={rsiInfo.color}
                      description={rsiInfo.text}
                    />
                  )}
                  {volInfo && volRatio !== undefined && (
                    <ReadingLine
                      label="Volume"
                      value={`${volRatio.toFixed(1)}×`}
                      valueClass={volInfo.color}
                      description={volInfo.text}
                    />
                  )}
                  {sm && (
                    <ReadingLine
                      label="Derivatives"
                      value={`${(pillarScores?.derivatives ?? 0)}`}
                      valueClass="text-violet-400"
                      description={smLabel(pnlPct, accel)}
                    />
                  )}
                  {fundInfo && fundingRate !== undefined && (
                    <ReadingLine
                      label="Funding"
                      value={`${(fundingRate * 100).toFixed(4)}%`}
                      valueClass={favorable ? 'text-bullish' : fundingRate > 0.001 ? 'text-bearish' : 'text-yellow-400'}
                      description={`${fundInfo.text}${annualized !== undefined ? ` · ${annualized.toFixed(1)}% ann.` : ''}`}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Pivot Points */}
            {pivots && (pivots.pp || pivots.s1 || pivots.r1) && (
              <div className="space-y-1.5">
                <span className="font-mono-data text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">
                  Pivot Points · 4H
                </span>
                <div className="grid grid-cols-5 gap-1">
                  {[
                    { label: 'S2', val: pivots.s2, cls: 'text-bearish border-bearish/20 bg-bearish/5' },
                    { label: 'S1', val: pivots.s1, cls: 'text-bearish/80 border-bearish/25 bg-bearish/8' },
                    { label: 'PP', val: pivots.pp, cls: 'text-foreground/70 border-border/30 bg-surface/20' },
                    { label: 'R1', val: pivots.r1, cls: 'text-bullish/80 border-bullish/25 bg-bullish/8' },
                    { label: 'R2', val: pivots.r2, cls: 'text-bullish border-bullish/20 bg-bullish/5' },
                  ].map(({ label, val, cls }) => (
                    <div key={label} className={cn('rounded border px-1.5 py-1.5 text-center', cls)}>
                      <div className="font-mono-data text-[6px] uppercase tracking-wider opacity-60 mb-0.5">{label}</div>
                      <div className="font-mono-data text-[9px] font-bold tabular-nums leading-none">
                        {val != null ? (val >= 1000 ? `$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : val >= 1 ? `$${val.toFixed(2)}` : `$${val.toFixed(4)}`) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risks */}
            {opp && opp.risks.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-mono-data text-[8px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">
                  Risks
                </span>
                <div className="flex flex-wrap gap-1">
                  {opp.risks.map((r, i) => (
                    <span key={i} className="rounded border border-bearish/25 bg-bearish/6 px-2 py-px font-mono-data text-[9px] text-bearish/75">
                      {r.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Exit Plan ── */}
        {exitLevels && (exitLevels.initialSL || exitLevels.tp1 || exitLevels.tp2) && (
          <div className="border-t border-border/20 bg-surface/5 px-4 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono-data text-[7px] uppercase tracking-[0.18em] text-muted-foreground/35 shrink-0 mr-1">
                Exit Plan
              </span>
              {exitLevels.initialSL != null && (
                <div className="flex items-center gap-1 rounded border border-bearish/25 bg-bearish/6 px-2 py-1">
                  <span className="font-mono-data text-[7px] uppercase tracking-wider text-bearish/50 shrink-0">SL</span>
                  <span className="font-mono-data text-[11px] font-bold tabular-nums text-bearish">{fmtPx(exitLevels.initialSL)}</span>
                </div>
              )}
              {exitLevels.tp1 != null && (
                <div className="flex items-center gap-1 rounded border border-bullish/20 bg-bullish/5 px-2 py-1">
                  <span className="font-mono-data text-[7px] uppercase tracking-wider text-bullish/50 shrink-0">TP1</span>
                  <span className="font-mono-data text-[11px] font-bold tabular-nums text-bullish">{fmtPx(exitLevels.tp1)}</span>
                </div>
              )}
              {exitLevels.tp2 != null && (
                <div className="flex items-center gap-1 rounded border border-bullish/15 bg-bullish/4 px-2 py-1">
                  <span className="font-mono-data text-[7px] uppercase tracking-wider text-bullish/40 shrink-0">TP2</span>
                  <span className="font-mono-data text-[11px] font-bold tabular-nums text-bullish/80">{fmtPx(exitLevels.tp2)}</span>
                </div>
              )}
              {exitLevels.riskPct != null && exitLevels.riskPct > 0 && (
                <div className="flex items-center gap-1 rounded border border-border/20 bg-surface/15 px-2 py-1">
                  <span className="font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/40 shrink-0">Risk</span>
                  <span className="font-mono-data text-[11px] font-bold tabular-nums text-foreground/70">{exitLevels.riskPct.toFixed(1)}%</span>
                </div>
              )}
              {exitLevels.trailingSLPct != null && (
                <div className="flex items-center gap-1 rounded border border-border/20 bg-surface/15 px-2 py-1">
                  <span className="font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/40 shrink-0">Trail</span>
                  <span className="font-mono-data text-[11px] font-bold tabular-nums text-foreground/70">{exitLevels.trailingSLPct.toFixed(1)}%</span>
                </div>
              )}
              {exitLevels.maxHoldHours != null && (
                <div className="flex items-center gap-1 rounded border border-border/20 bg-surface/15 px-2 py-1">
                  <span className="font-mono-data text-[7px] uppercase tracking-wider text-muted-foreground/40 shrink-0">Max Hold</span>
                  <span className="font-mono-data text-[11px] font-bold tabular-nums text-foreground/70">{exitLevels.maxHoldHours}h</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex items-center gap-3 border-t border-border/25 bg-surface/8 px-4 py-2.5">
          <a
            href="https://app.hyperliquid.xyz/trade"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono-data text-[10px] font-bold uppercase tracking-wider transition-colors',
              isLong
                ? 'border-bullish/40 bg-bullish/10 text-bullish hover:bg-bullish/20'
                : 'border-bearish/40 bg-bearish/10 text-bearish hover:bg-bearish/20'
            )}
          >
            Trade on Hyperliquid
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="ml-auto font-mono-data text-[8px] text-muted-foreground/30 uppercase tracking-wider">
            Not financial advice
          </span>
          <button
            onClick={onClose}
            className="rounded-lg border border-border/30 bg-surface/15 px-3 py-1.5 font-mono-data text-[10px] text-muted-foreground/55 hover:text-foreground/80 hover:border-border/50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
