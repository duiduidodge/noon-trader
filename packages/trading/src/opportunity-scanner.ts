/**
 * Opportunity Scanner — TypeScript port of scripts/opportunity-scan.py
 * Uses Binance Futures public APIs only (no API key required).
 * Produces the same JSON schema as OpportunitySnapshot / OpportunitySignal.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fetchHLAssetMap, type HLAssetMap } from './hyperliquid-client.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = 'https://fapi.binance.com';
const MIN_VOLUME_USDT = 60_000_000;
const STAGE1_LIMIT = 60;
const DEEP_LIMIT = 10;
const TOP_OUTPUT = 6;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_CONCURRENT = 8;
const REQUIRE_EMA_BOUNCE = process.env.OPPORTUNITY_REQUIRE_EMA_BOUNCE !== 'false';
const EMA_BOUNCE_MIN_CONFLUENCE = Math.max(1, Number(process.env.OPPORTUNITY_EMA_BOUNCE_MIN_CONFLUENCE || '2'));
// Checked at runtime (not import time) so CLI scripts can enable it
const isDebugGates = () => process.env.OPPORTUNITY_DEBUG_GATES === 'true';
const BLOCK_RANGING_REGIME = process.env.OPPORTUNITY_BLOCK_RANGING_REGIME !== 'false';
const MIN_VOL_RATIO = Number(process.env.OPPORTUNITY_MIN_VOL_RATIO || '1');

// Quality gates — signals must pass ALL of these to be emitted
const MIN_SCORE = Number(process.env.OPPORTUNITY_MIN_SCORE || '220'); // Minimum absolute score
const MIN_SCAN_STREAK = Number(process.env.OPPORTUNITY_MIN_SCAN_STREAK || '3'); // Consecutive scans required
const VOLATILE_SCORE_BONUS = Number(process.env.OPPORTUNITY_VOLATILE_SCORE_BONUS || '30'); // Extra floor in VOLATILE regime
const MAX_FUNDING_ANNUALIZED = 100;  // % — hard veto for extremely crowded longs
const MIN_ADX_TRENDING = Number(process.env.OPPORTUNITY_MIN_ADX_TRENDING || '25'); // ADX floor for TRENDING regime

// Conviction tier thresholds — A-tier gets posted to Discord, B-tier logged only
const A_TIER_MIN_SCORE = Number(process.env.OPPORTUNITY_A_TIER_MIN_SCORE || '260');
const A_TIER_MIN_STREAK = Number(process.env.OPPORTUNITY_A_TIER_MIN_STREAK || '6');
const A_TIER_MIN_ADX = Number(process.env.OPPORTUNITY_A_TIER_MIN_ADX || '28');

const EXCLUDE_SYMBOLS = new Set([
  'USDCUSDT', 'BUSDUSDT', 'TUSDUSDT', 'USDTUSDT', 'DAIUSDT',
  'BTCDOMUSDT', 'DEFIUSDT', 'ALTUSDT',
]);
const EXCLUDE_SUFFIXES = ['BULL', 'BEAR', 'UP', 'DOWN', '3L', '3S', '5L', '5S'];

// State file: prefer OPPORTUNITY_STATE_FILE env var, else project artifacts dir, else /tmp
function resolveStateFile(): string {
  if (process.env.OPPORTUNITY_STATE_FILE) return process.env.OPPORTUNITY_STATE_FILE;
  try {
    const artifactsDir = path.join(process.cwd(), 'artifacts');
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
    return path.join(artifactsDir, '.opportunity-state.json');
  } catch {
    return path.join(os.tmpdir(), '.opportunity-state.json');
  }
}

const STATE_FILE = resolveStateFile();

// Market-stats file: ring buffer of recent readings for adaptive thresholds
function resolveMarketStatsFile(): string {
  try {
    const artifactsDir = path.join(process.cwd(), 'artifacts');
    if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
    return path.join(artifactsDir, '.market-stats.json');
  } catch {
    return path.join(os.tmpdir(), '.market-stats.json');
  }
}

const MARKET_STATS_FILE = resolveMarketStatsFile();
const STATS_WINDOW = 500; // ~4 hours of data at 10 assets/scan, 5-min interval

// ─── Types ────────────────────────────────────────────────────────────────────

interface KlineData {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  vols: number[];
}

interface TickerRow {
  symbol: string;
  quoteVolume: string;
  lastPrice: string;
  priceChangePercent: string;
}

interface ScanState {
  [symbol: string]: { finalScore: number; scanStreak: number };
}

interface MarketStats {
  updatedAt: string;
  rsi: number[];      // last STATS_WINDOW 1H RSI readings
  volRatio: number[]; // last STATS_WINDOW volume ratio readings
}

interface AdaptiveThresholds {
  rsiLow: number;        // 15th-percentile RSI (stage-2 lower bound, default 25)
  rsiHigh: number;       // 85th-percentile RSI (stage-2 upper bound, default 78)
  volSpikeRatio: number; // 90th-percentile volRatio (spike threshold, default 2.5)
}

interface PivotPoints {
  pp: number;
  s1: number;
  r1: number;
  s2: number;
  r2: number;
}

interface EmaBounceFrameSignal {
  timeframe: '1h' | '2h' | '4h' | '1d';
  period: number;
  ema: number;
  price: number;
  distancePct: number;
  touched: boolean;
  reclaimed: boolean;
  rejected: boolean;
  valid: boolean;
}

interface EmaBounceSignal {
  direction: 'LONG' | 'SHORT';
  confluence: number;
  required: number;
  isValid: boolean;
  scoreBonus: number;
  frames: EmaBounceFrameSignal[];
}

export type MarketRegime = 'TRENDING' | 'RANGING' | 'VOLATILE';

export interface ExitLevels {
  initialSL: number;       // hard stop price
  trailingSLPct: number;   // trailing stop as % distance
  tp1: number;             // 2:1 R/R target
  tp2: number;             // 3:1 R/R target
  maxHoldHours: number;    // time-based exit
  riskPct: number;         // entry-to-SL distance as %
}

export interface PositionSize {
  riskPct: number;       // % of portfolio at risk (0.5–2%)
  positionPct: number;   // % of portfolio as position size
  dollarRisk10k: number; // dollar risk for a $10k portfolio
}

export interface OpportunityResult {
  asset: string;
  direction: string;
  leverage: number;
  finalScore: number;
  scoreDelta: number;
  scanStreak: number;
  hourlyTrend: string;
  trendAligned: boolean;
  swingGrade: boolean;
  volumeSpike: boolean;
  regime: MarketRegime;
  exitLevels: ExitLevels;
  positionSize: PositionSize;
  pillarScores: { derivatives: number; marketStructure: number; technicals: number; entryBonus?: number };
  smartMoney: { traders: number; pnlPct: number; accel: number; direction: string };
  technicals: {
    rsi1h: number; rsi15m: number | null; volRatio1h: number; volRatio15m: number | null;
    trend4h: string; trend1h: string; trendDaily: string; trendStrength: number;
    rsi1d: number; patterns1h: string[]; patterns15m: string[];
    momentum15m: number | null; chg1h: number; chg4h: number; chg24h: number;
    support: number | null; resistance: number | null;
    pivots: PivotPoints | null; weeklyPivots: PivotPoints | null; atrPct: number; adx4h: number;
    emaBounce: EmaBounceSignal;
  };
  funding: { rate: number; annualized: number; favorable: boolean };
  hyperliquid: { funding: number; openInterest: number; dayVolume: number } | null;
  risks: string[];
  convictionTier: 'A' | 'B';
  thesis?: string[];
  chartImageBase64?: string;
}

export interface OpportunityScanResult {
  scanTime: string;
  assetsScanned: number;
  passedStage1: number;
  passedStage2: number;
  deepDived: number;
  disqualified: number;
  filteredByGates: number;
  btcContext: { price: number; trend: string; trend4h: string; change1h: number; change24h: number };
  opportunities: OpportunityResult[];
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function getJson<T>(
  url: string,
  params?: Record<string, string | number>,
  retries = 2
): Promise<T | null> {
  const qs = params ? '?' + new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString() : '';

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(url + qs, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch {
      if (attempt < retries) await sleep(300 * (attempt + 1));
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Technical indicators ─────────────────────────────────────────────────────

function calculateRsi(closes: number[], period = 14): number {
  if (closes.length < period + 2) return 50;
  const deltas = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = deltas.map((d) => Math.max(d, 0));
  const losses = deltas.map((d) => Math.max(-d, 0));
  let avgG = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgL = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < deltas.length; i++) {
    avgG = (avgG * (period - 1) + gains[i]) / period;
    avgL = (avgL * (period - 1) + losses[i]) / period;
  }
  if (avgL === 0) return 100;
  return Math.round((100 - 100 / (1 + avgG / avgL)) * 100) / 100;
}

function calculateEma(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (const price of closes.slice(period)) ema = price * k + ema * (1 - k);
  return ema;
}

function calculateAtrPct(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < 2) return 1;
  const trs: number[] = [];
  for (let i = 1; i < Math.min(closes.length, period + 1); i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  const atr = trs.reduce((a, b) => a + b, 0) / (trs.length || 1);
  const price = closes[closes.length - 1];
  return price > 0 ? Math.round((atr / price) * 100 * 1000) / 1000 : 1;
}

function volumeRatio(vols: number[]): number {
  if (vols.length < 3) return 1;
  const baseline = vols.slice(0, -1).slice(-20);
  const avg = baseline.reduce((a, b) => a + b, 0) / (baseline.length || 1);
  return avg > 0 ? Math.round((vols[vols.length - 1] / avg) * 100) / 100 : 1;
}

function detectPatterns(
  closes: number[], opens: number[], highs: number[], lows: number[]
): string[] {
  const patterns: string[] = [];
  if (closes.length < 5) return patterns;
  const n = closes.length;

  if (highs[n - 1] > highs[n - 3] && lows[n - 1] > lows[n - 3]) patterns.push('higher_highs');
  else if (highs[n - 1] < highs[n - 3] && lows[n - 1] < lows[n - 3]) patterns.push('lower_lows');

  const ranges = [1, 2, 3].map((i) => closes[n - i] > 0 ? (highs[n - i] - lows[n - i]) / closes[n - i] : 0);
  if (ranges.reduce((a, b) => a + b, 0) / ranges.length < 0.005) patterns.push('consolidation');

  if (closes.length >= 2) {
    const prevBody = Math.abs(closes[n - 2] - opens[n - 2]);
    const currBody = Math.abs(closes[n - 1] - opens[n - 1]);
    if (closes[n - 1] > opens[n - 1] && opens[n - 1] < closes[n - 2]
        && closes[n - 1] > opens[n - 2] && currBody > prevBody) patterns.push('bull_engulf');
    else if (closes[n - 1] < opens[n - 1] && opens[n - 1] > closes[n - 2]
             && closes[n - 1] < opens[n - 2] && currBody > prevBody) patterns.push('bear_engulf');
  }
  return patterns;
}

// Classic pivot points from the last COMPLETE candle (index n-2, not n-1 which may be in-progress)
function calculatePivotPoints(highs: number[], lows: number[], closes: number[]): PivotPoints | null {
  if (highs.length < 2) return null;
  const i = highs.length - 2; // last complete candle
  const high = highs[i];
  const low = lows[i];
  const close = closes[i];
  const pp = (high + low + close) / 3;
  const p = 1_000_000;
  return {
    pp: Math.round(pp * p) / p,
    s1: Math.round(((2 * pp) - high) * p) / p,
    r1: Math.round(((2 * pp) - low) * p) / p,
    s2: Math.round((pp - (high - low)) * p) / p,
    r2: Math.round((pp + (high - low)) * p) / p,
  };
}

// Weekly pivot points from the last 7 complete daily candles (proxy for previous week range)
function calculateWeeklyPivotPoints(highs: number[], lows: number[], closes: number[]): PivotPoints | null {
  const n = highs.length;
  if (n < 9) return null;
  // Slice off today's in-progress candle (n-1) and use the 7 before it
  const weekHigh = Math.max(...highs.slice(-8, -1));
  const weekLow  = Math.min(...lows.slice(-8, -1));
  const weekClose = closes[n - 2]; // yesterday's close
  const pp = (weekHigh + weekLow + weekClose) / 3;
  const p = 1_000_000;
  return {
    pp: Math.round(pp * p) / p,
    s1: Math.round(((2 * pp) - weekHigh) * p) / p,
    r1: Math.round(((2 * pp) - weekLow) * p) / p,
    s2: Math.round((pp - (weekHigh - weekLow)) * p) / p,
    r2: Math.round((pp + (weekHigh - weekLow)) * p) / p,
  };
}

// Swing grade: true when daily + 4H + 1H all align and daily conditions are healthy
function evaluateSwingGrade(
  direction: string,
  trendAligned: boolean,   // 4H+1H both agree
  trendDaily: string,
  rsi1d: number,
  finalScore: number,
): boolean {
  if (!trendAligned) return false;
  const dailyAligned =
    (trendDaily === 'UP' && direction === 'LONG') ||
    (trendDaily === 'DOWN' && direction === 'SHORT');
  if (!dailyAligned) return false;
  // Daily RSI mid-zone: not overbought / not deeply oversold (mid-trend entries)
  if (rsi1d < 35 || rsi1d > 65) return false;
  // Higher conviction floor for multi-day hold (75% of 320 max)
  if (finalScore < 240) return false;
  return true;
}

// ─── Binance API fetchers ─────────────────────────────────────────────────────

async function fetchKlines(symbol: string, interval: string, limit: number): Promise<KlineData | null> {
  const configuredMarketDataUrl = process.env.MARKET_DATA_URL?.trim();
  const marketDataUrl = configuredMarketDataUrl ? configuredMarketDataUrl.replace(/\/+$/, '') : '';
  if (marketDataUrl) {
    const mcpSymbol = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
    const query = new URLSearchParams({
      symbol: mcpSymbol,
      timeframe: interval,
      limit: String(limit),
    });
    const response = await fetch(`${marketDataUrl}/candles?${query.toString()}`);
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      candles?: {
        opens: number[];
        highs: number[];
        lows: number[];
        closes: number[];
        volumes?: number[];
      };
    };
    if (!payload.candles) return null;
    return {
      opens: payload.candles.opens.map(Number),
      highs: payload.candles.highs.map(Number),
      lows: payload.candles.lows.map(Number),
      closes: payload.candles.closes.map(Number),
      vols: (payload.candles.volumes ?? []).map(Number),
    };
  }

  const data = await getJson<unknown[][]>(`${BASE_URL}/fapi/v1/klines`, { symbol, interval, limit });
  if (!data || !Array.isArray(data)) return null;
  return {
    opens:  data.map((k) => parseFloat(k[1] as string)),
    highs:  data.map((k) => parseFloat(k[2] as string)),
    lows:   data.map((k) => parseFloat(k[3] as string)),
    closes: data.map((k) => parseFloat(k[4] as string)),
    vols:   data.map((k) => parseFloat(k[5] as string)),
  };
}

async function fetchTopLongShort(symbol: string): Promise<number | null> {
  const data = await getJson<Array<{ longShortRatio: string }>>(
    `${BASE_URL}/futures/data/topLongShortPositionRatio`,
    { symbol, period: '1h', limit: 3 }
  );
  if (!data || !data.length) return null;
  const val = parseFloat(data[data.length - 1].longShortRatio);
  return isNaN(val) ? null : val;
}

async function fetchTakerRatio(symbol: string): Promise<number | null> {
  const data = await getJson<Array<{ buySellRatio: string }>>(
    `${BASE_URL}/futures/data/takerlongshortRatio`,
    { symbol, period: '1h', limit: 3 }
  );
  if (!data || !data.length) return null;
  const val = parseFloat(data[data.length - 1].buySellRatio);
  return isNaN(val) ? null : val;
}

async function fetchOiChange(symbol: string): Promise<number | null> {
  const data = await getJson<Array<{ sumOpenInterestValue: string }>>(
    `${BASE_URL}/futures/data/openInterestHist`,
    { symbol, period: '1h', limit: 5 }
  );
  if (!data || data.length < 2) return null;
  const oldest = parseFloat(data[0].sumOpenInterestValue);
  const newest = parseFloat(data[data.length - 1].sumOpenInterestValue);
  if (isNaN(oldest) || isNaN(newest) || oldest === 0) return null;
  return Math.round((newest - oldest) / oldest * 100 * 100) / 100;
}

async function fetchFundingRate(symbol: string): Promise<number | null> {
  const data = await getJson<{ lastFundingRate?: string }>(
    `${BASE_URL}/fapi/v1/premiumIndex`,
    { symbol }
  );
  if (!data?.lastFundingRate) return null;
  const val = parseFloat(data.lastFundingRate);
  return isNaN(val) ? null : val;
}

// ─── Scoring (3-pillar system) ────────────────────────────────────────────────

// Pillar 1: Derivatives — unified funding + OI + L/S ratio + taker flow
function scoreDerivatives(
  direction: string,
  fundingRate: number | null,
  oiChg: number | null,
  topLs: number | null,
  takerR: number | null,
  chg1h: number,
  chg24h: number,
  atrPct: number,  // ATR-normalized chase filter thresholds
  hlData: { funding: number; openInterest: number; dayVolume: number } | null, // HL on-chain data
): { score: number; risks: string[]; hardVeto: boolean; annualized: number; favorable: boolean } {
  const risks: string[] = [];
  let hardVeto = false;
  let annualized = 0;
  let favorable = false;

  // ── ATR-normalized 24h chase filter ──────────────────────────────────────
  // A 24h move > 5× ATR is exhaustion; > 3× ATR is a soft warning
  const chaseVeto = Math.max(15, atrPct * 5); // floor at 15% to avoid over-filtering
  const chaseSoft = Math.max(8, atrPct * 3);  // floor at 8%
  const chg24hInDir =
    (direction === 'LONG' && chg24h > 0) ? chg24h :
    (direction === 'SHORT' && chg24h < 0) ? Math.abs(chg24h) : 0;
  if (chg24hInDir > chaseVeto) { hardVeto = true; risks.push('chasing_pump'); }
  else if (chg24hInDir > chaseSoft) risks.push('chasing_pump');

  // ── Funding (contributes -20 to +20) ─────────────────────────────────────
  let fAdj = 0;
  if (fundingRate !== null) {
    annualized = Math.round(fundingRate * 3 * 365 * 100 * 100) / 100;
    if (direction === 'LONG') {
      if (annualized > MAX_FUNDING_ANNUALIZED) { hardVeto = true; risks.push('extreme_funding'); }
      else if (fundingRate < -0.0002) { fAdj = 20; favorable = true; }
      else if (fundingRate < 0)       { fAdj = 12; favorable = true; }
      else if (fundingRate < 0.0002)   fAdj = 2;
      else if (fundingRate < 0.001)    fAdj = -8;
      else { fAdj = -20; risks.push('high_funding'); }
    } else {
      if (fundingRate > 0.0002)        { fAdj = 20; favorable = true; }
      else if (fundingRate > 0)        { fAdj = 12; favorable = true; }
      else if (fundingRate > -0.0002)   fAdj = 2;
      else                              fAdj = -15;
    }
  }

  // ── OI change (contributes -15 to +15) ───────────────────────────────────
  let oiAdj = 0;
  if (oiChg !== null) {
    const priceAligned  = (direction === 'LONG' && chg1h > 0) || (direction === 'SHORT' && chg1h < 0);
    const priceDiverges = (direction === 'LONG' && chg1h < 0) || (direction === 'SHORT' && chg1h > 0);
    if (oiChg > 5) {
      if (priceAligned)       oiAdj = 15;
      else if (priceDiverges) { oiAdj = -15; risks.push('oi_price_divergence'); }
      else                    oiAdj = 5;
    } else if (oiChg > 2) {
      oiAdj = 8;
    } else if (oiChg < -5) {
      oiAdj = -10;
    }
  }

  // ── L/S ratio (contributes -10 to +12) ───────────────────────────────────
  let lsAdj = 0;
  if (topLs !== null) {
    const ratio = direction === 'LONG' ? topLs : (topLs > 0 ? 1 / topLs : 1);
    if      (ratio >= 1.5) lsAdj = 12;
    else if (ratio >= 1.2) lsAdj = 8;
    else if (ratio >= 1.0) lsAdj = 3;
    else if (ratio >= 0.8) lsAdj = -3;
    else                   lsAdj = -10;
  }

  // ── Taker ratio (contributes -5 to +8) ───────────────────────────────────
  let takerAdj = 0;
  if (takerR !== null) {
    const aligned = (direction === 'LONG' && takerR > 1.1) || (direction === 'SHORT' && takerR < 0.9);
    const opposed = (direction === 'LONG' && takerR < 0.9) || (direction === 'SHORT' && takerR > 1.1);
    if (aligned)      takerAdj = 8;
    else if (opposed) takerAdj = -5;
  }

  // ── Hyperliquid on-chain confirmation ─────────────────────────────────────
  let hlAdj = 0;
  if (hlData && fundingRate !== null) {
    // Funding divergence: HL and Binance funding disagree in sign → informational risk
    const binanceSign = fundingRate > 0.00001 ? 1 : fundingRate < -0.00001 ? -1 : 0;
    const hlSign = hlData.funding > 0.00001 ? 1 : hlData.funding < -0.00001 ? -1 : 0;
    if (binanceSign !== 0 && hlSign !== 0 && binanceSign !== hlSign) {
      risks.push('hl_funding_divergence');
      hlAdj = -5; // Divergent venues signal uncertainty
    } else if (binanceSign !== 0 && hlSign === binanceSign && favorable) {
      hlAdj = 3; // Both venues confirm favorable funding
    }
  }

  const score = Math.min(100, Math.max(0, 50 + fAdj + oiAdj + lsAdj + takerAdj + hlAdj));
  if (score < 35) hardVeto = true; // Derivatives actively against this trade

  return { score, risks, hardVeto, annualized, favorable };
}

// Pillar 2: Structure — trend alignment + volume + ADX trend strength
function scoreStructure(
  direction: string,
  trend4h: string,
  trend1h: string,
  volR: number | null,
  adx4h: number,
): { score: number; risks: string[] } {
  const t4Aligned = (direction === 'LONG' && trend4h === 'UP') || (direction === 'SHORT' && trend4h === 'DOWN');
  const t4Opposed = (direction === 'LONG' && trend4h === 'DOWN') || (direction === 'SHORT' && trend4h === 'UP');
  const t1Aligned = (direction === 'LONG' && trend1h === 'UP') || (direction === 'SHORT' && trend1h === 'DOWN');
  const t1Opposed = (direction === 'LONG' && trend1h === 'DOWN') || (direction === 'SHORT' && trend1h === 'UP');

  let base = 50;
  if (t4Aligned && t1Aligned)      base = 68;
  else if (t4Aligned)               base = 58;
  else if (t1Aligned)               base = 55;
  else if (t4Opposed || t1Opposed)  base = 35;

  if (volR !== null && volR >= 1.5) base += 8;
  if (adx4h >= 30)       base += 10;
  else if (adx4h >= 25)  base += 5;

  return { score: Math.min(100, Math.max(0, base)), risks: [] };
}

// Pillar 3: Technicals — RSI + volume spike + 15m confirmation
function scoreTechnicals(
  direction: string,
  rsi1h: number | null,
  rsi15m: number | null,
  volR: number | null,
  emaBounceBonus: number,
  volSpikeRatio: number, // adaptive spike threshold (default 2.5)
): { score: number; risks: string[] } {
  const risks: string[] = [];
  let tech = 50;

  if (rsi1h !== null) {
    if (direction === 'LONG') {
      if (rsi1h >= 45 && rsi1h <= 65)  tech = 72;
      else if (rsi1h >= 30 && rsi1h < 45) tech = 78;
      else if (rsi1h < 30)             tech = 62;
      else if (rsi1h > 75)             { tech = 32; risks.push('overbought_rsi'); }
      else                             tech = 55;
    } else {
      if (rsi1h >= 55 && rsi1h <= 72)  tech = 72;
      else if (rsi1h > 72)             tech = 78;
      else if (rsi1h < 30)             { tech = 32; risks.push('oversold_rsi'); }
      else                             tech = 55;
    }
  }
  if (rsi15m !== null) {
    const good15m = (direction === 'LONG' && rsi15m >= 45 && rsi15m <= 70)
                 || (direction === 'SHORT' && rsi15m >= 55 && rsi15m <= 75);
    if (good15m) tech = Math.min(100, tech + 8);
  }
  if (volR !== null) {
    if (volR >= volSpikeRatio)      tech = Math.min(100, tech + 15); // spike
    else if (volR >= 1.5)           tech = Math.min(100, tech + 8);  // elevated
    else if (volR < 0.6)            { tech = Math.max(0, tech - 15); risks.push('low_volume'); }
  }

  if (emaBounceBonus > 0) {
    tech = Math.min(100, tech + emaBounceBonus);
  }

  return { score: tech, risks };
}

function evaluateEmaBounceFrame(
  direction: 'LONG' | 'SHORT',
  timeframe: '1h' | '2h' | '4h' | '1d',
  period: number,
  highs: number[],
  lows: number[],
  closes: number[],
  touchTolerancePct: number,
): EmaBounceFrameSignal {
  const price = closes[closes.length - 1] ?? 0;
  const ema = calculateEma(closes, period);
  const distancePct = ema > 0 ? ((price - ema) / ema) * 100 : 0;
  const lookback = Math.min(3, lows.length);
  const recentLows = lows.slice(-lookback);
  const recentHighs = highs.slice(-lookback);
  const lastLow = lows[lows.length - 1] ?? price;
  const lastHigh = highs[highs.length - 1] ?? price;
  const lastRange = Math.max(1e-9, lastHigh - lastLow);
  const closePos = (price - lastLow) / lastRange; // 0=low close, 1=high close

  const upperTouch = ema * (1 + touchTolerancePct / 100);
  const lowerTouch = ema * (1 - touchTolerancePct / 100);

  const touched = direction === 'LONG'
    ? Math.min(...recentLows) <= upperTouch
    : Math.max(...recentHighs) >= lowerTouch;
  const reclaimed = direction === 'LONG' ? price >= ema : price <= ema;
  const rejected = direction === 'LONG' ? closePos >= 0.55 : closePos <= 0.45;
  const notExtended = Math.abs(distancePct) <= touchTolerancePct * 2.5;
  const valid = touched && reclaimed && rejected && notExtended;

  return {
    timeframe,
    period,
    ema: Math.round(ema * 1_000_000) / 1_000_000,
    price: Math.round(price * 1_000_000) / 1_000_000,
    distancePct: Math.round(distancePct * 100) / 100,
    touched,
    reclaimed,
    rejected,
    valid,
  };
}

function analyzeEmaBounceSignal(
  direction: 'LONG' | 'SHORT',
  klines1h: KlineData,
  klines2h: KlineData | null,
  klines4h: KlineData | null,
  klines1d: KlineData | null,
  atrPct: number
): EmaBounceSignal {
  const tf1hTol = Math.max(0.5, Math.min(1.6, atrPct * 0.45));
  const tf2hTol = Math.max(0.7, Math.min(2.0, atrPct * 0.6));
  const tf4hTol = Math.max(0.9, Math.min(2.4, atrPct * 0.75));
  const tf1dTol = Math.max(1.0, Math.min(2.8, atrPct * 0.9));

  const frames: EmaBounceFrameSignal[] = [
    evaluateEmaBounceFrame(direction, '1h', 200, klines1h.highs, klines1h.lows, klines1h.closes, tf1hTol),
  ];

  if (klines2h && klines2h.closes.length >= 200) {
    frames.push(evaluateEmaBounceFrame(direction, '2h', 200, klines2h.highs, klines2h.lows, klines2h.closes, tf2hTol));
  }
  if (klines4h && klines4h.closes.length >= 200) {
    frames.push(evaluateEmaBounceFrame(direction, '4h', 200, klines4h.highs, klines4h.lows, klines4h.closes, tf4hTol));
  }
  if (klines1d && klines1d.closes.length >= 50) {
    frames.push(evaluateEmaBounceFrame(direction, '1d', 50, klines1d.highs, klines1d.lows, klines1d.closes, tf1dTol));
  }

  const confluence = frames.filter((f) => f.valid).length;
  const isValid = confluence >= EMA_BOUNCE_MIN_CONFLUENCE;
  const scoreBonus = isValid ? Math.min(20, 8 + confluence * 4) : 0;

  return {
    direction,
    confluence,
    required: EMA_BOUNCE_MIN_CONFLUENCE,
    isValid,
    scoreBonus,
    frames,
  };
}

// Position sizing based on score quality and exit-level risk distance
function calculatePositionSize(finalScore: number, exitLevels: ExitLevels): PositionSize {
  const scoreRatio = Math.min(1, Math.max(0, finalScore / 300));
  const riskPct = Math.round((0.5 + scoreRatio * 1.5) * 100) / 100; // 0.5% to 2%
  const slDistPct = exitLevels.riskPct; // already a %-distance (e.g. 1.5 for 1.5%)
  const positionPct = slDistPct > 0
    ? Math.min(25, Math.round(riskPct / (slDistPct / 100) * 100) / 100)
    : 5;
  const dollarRisk10k = Math.round(10000 * riskPct / 100 * 100) / 100;
  return { riskPct, positionPct, dollarRisk10k };
}

// Returns null if 1H and 4H trends conflict — asset should be skipped
function chooseDirection(
  rsi1h: number | null, trend4h: string, trend1h: string,
  topLs: number | null, takerR: number | null
): 'LONG' | 'SHORT' | null {
  // Timeframe agreement required: both non-FLAT trends must point the same way
  if (trend4h !== 'FLAT' && trend1h !== 'FLAT' && trend4h !== trend1h) {
    return null; // Conflicting 1H/4H trends — skip this asset
  }

  let longV = 0, shortV = 0;
  // 4H carries more weight (longer timeframe = more reliable)
  if (trend4h === 'UP') longV += 2;
  else if (trend4h === 'DOWN') shortV += 2;
  // 1H adds confirmation
  if (trend1h === 'UP') longV += 1;
  else if (trend1h === 'DOWN') shortV += 1;
  // RSI context
  if (rsi1h !== null) {
    if (rsi1h < 40) longV++;
    else if (rsi1h > 65) shortV++;
  }
  // Smart money positioning
  if (topLs !== null) {
    if (topLs > 1.2) longV++;
    else if (topLs < 0.8) shortV++;
  }
  // Taker pressure
  if (takerR !== null) {
    if (takerR > 1.1) longV++;
    else if (takerR < 0.9) shortV++;
  }
  if (Math.abs(longV - shortV) < 2) return null; // No conviction — require clear margin
  return longV > shortV ? 'LONG' : 'SHORT';
}

function recommendLeverage(atrPct: number, regime: MarketRegime): number {
  // Volatile regime: reduce leverage by 1 tier
  const base = atrPct > 3 ? 3 : atrPct > 2 ? 5 : atrPct > 1 ? 8 : 10;
  return regime === 'VOLATILE' ? Math.max(3, base - (base <= 5 ? 1 : 2)) : base;
}

// ADX via Wilder smoothing — uses 4H kline data (already fetched)
function calculateAdx(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < period * 2 + 2) return 25; // neutral default if insufficient data

  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trArr: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const upMove   = highs[i]  - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trArr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }

  // Wilder's smoothing seed
  let smTr     = trArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smPlusDM  = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const dxArr: number[] = [];
  for (let i = period; i < trArr.length; i++) {
    smTr      = smTr     - smTr / period     + trArr[i];
    smPlusDM  = smPlusDM  - smPlusDM / period  + plusDM[i];
    smMinusDM = smMinusDM - smMinusDM / period + minusDM[i];

    const plusDI  = smTr > 0 ? (smPlusDM  / smTr) * 100 : 0;
    const minusDI = smTr > 0 ? (smMinusDM / smTr) * 100 : 0;
    const sumDI   = plusDI + minusDI;
    dxArr.push(sumDI > 0 ? Math.abs(plusDI - minusDI) / sumDI * 100 : 0);
  }

  if (dxArr.length < period) return 25;
  const adx = dxArr.slice(-period).reduce((a, b) => a + b, 0) / period;
  return Math.round(adx * 10) / 10;
}

// Regime classification: TRENDING, RANGING, or VOLATILE
function classifyRegime(adx4h: number, atrPct14: number, atrPct50: number): MarketRegime {
  const atrRatio = atrPct50 > 0 ? atrPct14 / atrPct50 : 1;
  if (adx4h >= 25 && atrRatio < 1.8) return 'TRENDING';
  if (adx4h < 20  && atrRatio < 1.2) return 'RANGING';
  return 'VOLATILE';
}

// ATR-based exit levels with pivot refinement
function calculateExitLevels(
  currentPrice: number,
  direction: string,
  atrPct: number,
  pivots: PivotPoints | null,
  regime: MarketRegime,
): ExitLevels {
  const p = 1_000_000;
  const atrMultiplier = regime === 'VOLATILE' ? 2.0 : 1.5;
  const slDist = (atrPct / 100) * atrMultiplier * currentPrice;

  let slPrice: number;
  if (direction === 'LONG') {
    // Use tighter of: ATR-based stop or S1 pivot (when S1 is tighter)
    const pivotSL = pivots?.s1 ?? (currentPrice - slDist);
    const atrSL   = currentPrice - slDist;
    slPrice = Math.max(pivotSL, atrSL); // tighter (higher) stop
    slPrice = Math.min(slPrice, currentPrice * 0.98); // never more than 2% below for sanity
  } else {
    const pivotSL = pivots?.r1 ?? (currentPrice + slDist);
    const atrSL   = currentPrice + slDist;
    slPrice = Math.min(pivotSL, atrSL); // tighter (lower) stop
    slPrice = Math.max(slPrice, currentPrice * 1.02); // never more than 2% above
  }

  const riskDist  = Math.abs(currentPrice - slPrice);
  const riskPct   = currentPrice > 0 ? Math.round(riskDist / currentPrice * 100 * 100) / 100 : 1;

  const tp1 = direction === 'LONG'
    ? Math.round((currentPrice + riskDist * 2) * p) / p
    : Math.round((currentPrice - riskDist * 2) * p) / p;
  const tp2 = direction === 'LONG'
    ? Math.round((currentPrice + riskDist * 3) * p) / p
    : Math.round((currentPrice - riskDist * 3) * p) / p;

  const maxHoldHours = regime === 'TRENDING' ? 48 : regime === 'RANGING' ? 24 : 12;

  return {
    initialSL:     Math.round(slPrice * p) / p,
    trailingSLPct: Math.round(atrPct * atrMultiplier * 100) / 100,
    tp1,
    tp2,
    maxHoldHours,
    riskPct,
  };
}

// ─── State & market stats persistence ────────────────────────────────────────

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 50;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p / 100);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function loadMarketStats(): MarketStats {
  try {
    return JSON.parse(fs.readFileSync(MARKET_STATS_FILE, 'utf8')) as MarketStats;
  } catch {
    return { updatedAt: '', rsi: [], volRatio: [] };
  }
}

function saveMarketStats(stats: MarketStats): void {
  try {
    fs.writeFileSync(MARKET_STATS_FILE, JSON.stringify(stats), 'utf8');
  } catch { /* best effort */ }
}

function computeThresholds(stats: MarketStats): AdaptiveThresholds {
  const hasEnough = stats.rsi.length >= 50;
  return {
    rsiLow:        hasEnough ? Math.max(20, percentile(stats.rsi, 15)) : 25,
    rsiHigh:       hasEnough ? Math.min(82, percentile(stats.rsi, 85)) : 78,
    volSpikeRatio: stats.volRatio.length >= 50 ? Math.max(1.8, percentile(stats.volRatio, 90)) : 2.5,
  };
}

function loadState(): ScanState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as ScanState;
  } catch {
    return {};
  }
}

function saveState(state: ScanState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
  } catch { /* best effort */ }
}

// ─── Per-asset deep analysis ──────────────────────────────────────────────────

async function analyzeAsset(
  symbol: string,
  ticker: TickerRow,
  prevState: ScanState,
  thresholds: AdaptiveThresholds,
  hlMap: HLAssetMap | null,
): Promise<(OpportunityResult & { _symbol: string; _finalScore: number }) | null> {
  try {
    const [klines1h, klines2h, klines4h, klines15m, klines1d] = await Promise.all([
      fetchKlines(symbol, '1h', 220), // EMA200 + short-term structure
      fetchKlines(symbol, '2h', 220), // EMA200 bounce confluence
      fetchKlines(symbol, '4h', 220), // EMA200 + pivots + ADX
      fetchKlines(symbol, '15m', 35),
      fetchKlines(symbol, '1d', 80), // EMA50 daily bounce + swing context
    ]);

    if (!klines1h) return null;

    const { opens: o1h, highs: h1h, lows: l1h, closes: c1h, vols: v1h } = klines1h;

    const [topLs, takerR, oiChg, fundingRate] = await Promise.all([
      fetchTopLongShort(symbol),
      fetchTakerRatio(symbol),
      fetchOiChange(symbol),
      fetchFundingRate(symbol),
    ]);

    // Resolve Hyperliquid on-chain data for this symbol (coin = symbol without USDT suffix)
    const hlCoin = symbol.replace('USDT', '');
    const hlCtx = hlMap?.get(hlCoin) ?? null;
    const hlData = hlCtx ? {
      funding: hlCtx.funding,
      openInterest: hlCtx.openInterest,
      dayVolume: hlCtx.dayVolume,
    } : null;

    const rsi1h = calculateRsi(c1h);
    const rsi15m = klines15m ? calculateRsi(klines15m.closes) : null;
    const volR = volumeRatio(v1h);
    const volR15m = klines15m ? volumeRatio(klines15m.vols) : null;
    const atrPct = calculateAtrPct(h1h, l1h, c1h);       // 14-period ATR %
    const atrPct50 = calculateAtrPct(h1h, l1h, c1h, 50); // 50-period baseline ATR %
    const adx4h = klines4h ? calculateAdx(klines4h.highs, klines4h.lows, klines4h.closes) : 25;

    // 4H trend: EMA20 vs EMA50
    let trend4h = 'FLAT';
    let trendStrength = 50;
    if (klines4h && klines4h.closes.length >= 20) {
      const c4h = klines4h.closes;
      const ema20 = calculateEma(c4h, 20);
      const ema50 = calculateEma(c4h, Math.min(50, c4h.length));
      const curr = c4h[c4h.length - 1];
      if (curr > ema20 && ema20 > ema50) {
        trend4h = 'UP';
        trendStrength = Math.min(100, Math.round((curr - ema50) / ema50 * 4000));
      } else if (curr < ema20 && ema20 < ema50) {
        trend4h = 'DOWN';
        trendStrength = Math.min(100, Math.round((ema50 - curr) / ema50 * 4000));
      }
    }

    // 1H trend: EMA9 vs EMA21 (more reliable than 2-candle comparison)
    let trend1h = 'FLAT';
    if (c1h.length >= 21) {
      const ema9 = calculateEma(c1h, 9);
      const ema21 = calculateEma(c1h, 21);
      const curr = c1h[c1h.length - 1];
      if (curr > ema9 && ema9 > ema21) trend1h = 'UP';
      else if (curr < ema9 && ema9 < ema21) trend1h = 'DOWN';
    }

    // Daily trend, RSI, and weekly pivots for swing grade
    let trendDaily = 'FLAT';
    let rsi1d = 50;
    let weeklyPivots: PivotPoints | null = null;
    if (klines1d && klines1d.closes.length >= 21) {
      const c1d = klines1d.closes;
      const ema20d = calculateEma(c1d, 20);
      const ema50d = calculateEma(c1d, Math.min(50, c1d.length));
      const curr1d = c1d[c1d.length - 1];
      if (curr1d > ema20d && ema20d > ema50d) trendDaily = 'UP';
      else if (curr1d < ema20d && ema20d < ema50d) trendDaily = 'DOWN';
      rsi1d = calculateRsi(c1d, 14);
      weeklyPivots = calculateWeeklyPivotPoints(klines1d.highs, klines1d.lows, klines1d.closes);
    }

    // Compute chg1h before scorePillars (needed for OI divergence check)
    const chg1h = c1h.length > 1 && c1h[c1h.length - 2] > 0
      ? Math.round((c1h[c1h.length - 1] - c1h[c1h.length - 2]) / c1h[c1h.length - 2] * 100 * 100) / 100 : 0;

    // Compute chg24h before scorePillars (needed for chase filter hard veto)
    const chg24h = Math.round(parseFloat(ticker.priceChangePercent ?? '0') * 100) / 100;

    // Direction: requires 1H and 4H agreement — returns null if conflicting
    const direction = chooseDirection(rsi1h, trend4h, trend1h, topLs, takerR);
    if (direction === null) return null; // Conflicting timeframes — skip
    const emaBounce = analyzeEmaBounceSignal(direction, klines1h, klines2h, klines4h, klines1d, atrPct);

    const { score: derivScore, risks: derivRisks, hardVeto, annualized, favorable } = scoreDerivatives(
      direction, fundingRate, oiChg, topLs, takerR, chg1h, chg24h, atrPct, hlData
    );
    if (hardVeto) return null;

    const { score: structScore, risks: structRisks } = scoreStructure(direction, trend4h, trend1h, volR, adx4h);
    const { score: techScore, risks: techRisks } = scoreTechnicals(
      direction, rsi1h, rsi15m, volR, emaBounce.scoreBonus, thresholds.volSpikeRatio
    );

    // ── Price-vs-pivot gate ───────────────────────────────────────────────────
    const pivots = klines4h
      ? calculatePivotPoints(klines4h.highs, klines4h.lows, klines4h.closes)
      : null;
    const currentPrice = c1h[c1h.length - 1];

    const risks = [...derivRisks, ...structRisks, ...techRisks];
    if (!emaBounce.isValid) risks.push('ema_bounce_not_confirmed');

    if (pivots) {
      // Hard veto: price fully beyond R2 (LONG) or below S2 (SHORT) — move is over
      if (direction === 'LONG'  && currentPrice > pivots.r2) return null;
      if (direction === 'SHORT' && currentPrice < pivots.s2) return null;
      // Soft: >2% above R1 (LONG) or >2% below S1 (SHORT) — stretched entry
      if (direction === 'LONG'  && currentPrice > pivots.r1 * 1.02) risks.push('extended_entry');
      if (direction === 'SHORT' && currentPrice < pivots.s1 * 0.98) risks.push('extended_entry');
    }

    // ── Late-entry risk ───────────────────────────────────────────────────────
    const lateEntryRisks: string[] = [];
    if (Math.abs(chg1h) > atrPct * 0.8) {
      lateEntryRisks.push('late_entry'); // Current 1H candle already >80% of ATR
    }

    // ── Entry zone bonus: reward price near key pivot level ───────────────────
    // Best R/R comes from entering where the SL is defined by a nearby support/resistance.
    let entryBonus = 0;
    if (pivots) {
      if (direction === 'LONG') {
        const pctAboveS1 = (currentPrice - pivots.s1) / pivots.s1 * 100;
        if (pctAboveS1 < 0)      entryBonus = 20; // Below S1 — oversold/bounce, tight SL
        else if (pctAboveS1 < 1) entryBonus = 15; // Within 1% of S1 — ideal entry zone
        else if (pctAboveS1 < 3) entryBonus = 8;  // Near S1 — decent entry
      } else {
        const pctBelowR1 = (pivots.r1 - currentPrice) / pivots.r1 * 100;
        if (pctBelowR1 < 0)      entryBonus = 20; // Above R1 — breakout SHORT setup
        else if (pctBelowR1 < 1) entryBonus = 15;
        else if (pctBelowR1 < 3) entryBonus = 8;
      }
    }

    // ── Regime classification ─────────────────────────────────────────────────
    const regime = classifyRegime(adx4h, atrPct, atrPct50);

    // ── Exit levels ───────────────────────────────────────────────────────────
    const exitLevels = calculateExitLevels(currentPrice, direction, atrPct, pivots, regime);

    const trendAligned = (direction === 'LONG' && trend4h === 'UP')
                      || (direction === 'SHORT' && trend4h === 'DOWN');
    const finalScore = derivScore + structScore + techScore + entryBonus;
    const swingGrade = evaluateSwingGrade(direction, trendAligned, trendDaily, rsi1d, finalScore);
    const leverage = recommendLeverage(atrPct, regime);
    const positionSize = calculatePositionSize(finalScore, exitLevels);

    const prev = prevState[symbol] ?? { finalScore, scanStreak: 0 };
    const scanStreak = prev.scanStreak + 1;
    const scoreDelta = finalScore - prev.finalScore;

    const chg4h = c1h.length > 5 && c1h[c1h.length - 5] > 0
      ? Math.round((c1h[c1h.length - 1] - c1h[c1h.length - 5]) / c1h[c1h.length - 5] * 100 * 100) / 100 : 0;

    const patterns1h = detectPatterns(c1h, o1h, h1h, l1h);
    const patterns15m = klines15m
      ? detectPatterns(klines15m.closes, klines15m.opens, klines15m.highs, klines15m.lows)
      : [];

    const momentum15m = klines15m && klines15m.closes.length >= 5 && klines15m.closes[klines15m.closes.length - 5] > 0
      ? Math.round((klines15m.closes[klines15m.closes.length - 1] - klines15m.closes[klines15m.closes.length - 5])
          / klines15m.closes[klines15m.closes.length - 5] * 100 * 100) / 100
      : null;

    // Proxy conviction scale when explicit trader-count feed is unavailable.
    // Anchors around 100 and scales with long/short imbalance.
    const smTraders = Math.max(10, Math.round((topLs ?? 1) * 100));
    const smPnl = topLs !== null ? Math.round((topLs - 1) * 12 * 10) / 10 : 0;
    const smAccel = oiChg !== null ? Math.round(oiChg / 10 * 100) / 100 : 0;

    return {
      asset: symbol.replace('USDT', ''),
      direction,
      leverage,
      finalScore,
      scoreDelta,
      scanStreak,
      hourlyTrend: trend1h,
      trendAligned,
      swingGrade,
      volumeSpike: (volR ?? 0) >= 2.5,
      regime,
      exitLevels,
      positionSize,
      pillarScores: { derivatives: derivScore, marketStructure: structScore, technicals: techScore, entryBonus },
      smartMoney: { traders: smTraders, pnlPct: smPnl, accel: smAccel, direction },
      technicals: {
        rsi1h, rsi15m, volRatio1h: volR, volRatio15m: volR15m,
        trend4h, trend1h, trendDaily, trendStrength,
        rsi1d, patterns1h, patterns15m,
        momentum15m, chg1h, chg4h, chg24h,
        support: pivots?.s1 ?? null,
        resistance: pivots?.r1 ?? null,
        pivots, weeklyPivots,
        atrPct, adx4h,
        emaBounce,
      },
      funding: {
        rate: fundingRate !== null ? Math.round(fundingRate * 1_000_000) / 1_000_000 : 0,
        annualized,
        favorable,
      },
      hyperliquid: hlData,
      risks: [...risks, ...lateEntryRisks],
      convictionTier: 'B' as const, // Default B; upgraded to A in post-analysis
      _symbol: symbol,
      _finalScore: finalScore,
    };
  } catch {
    return null;
  }
}

// ─── Concurrency limiter ──────────────────────────────────────────────────────

async function runConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R | null>,
  concurrency: number
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ─── Main scan function ───────────────────────────────────────────────────────

export async function runOpportunityScan(): Promise<OpportunityScanResult> {
  const scanTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const prevState = loadState();

  // Load market stats and compute adaptive thresholds
  const marketStats = loadMarketStats();
  const thresholds = computeThresholds(marketStats);

  // Fetch Hyperliquid data once for the whole scan (feature-flagged)
  const mcpEnabled = Boolean(process.env.MARKET_DATA_URL?.trim());
  const hlEnabled = process.env.ENABLE_HYPERLIQUID === 'true' || mcpEnabled;
  const hlMap: HLAssetMap | null = hlEnabled ? await fetchHLAssetMap() : null;

  // Fetch all tickers
  const allTickers = await getJson<TickerRow[]>(`${BASE_URL}/fapi/v1/ticker/24hr`);
  if (!allTickers || !Array.isArray(allTickers)) {
    throw new Error('Failed to fetch Binance Futures tickers');
  }

  const tickerMap = new Map(allTickers.map((t) => [t.symbol, t]));
  const assetsScanned = allTickers.length;

  // Stage 1: volume + symbol filter
  const stage1 = allTickers
    .filter((t) => {
      const sym = t.symbol;
      if (!sym.endsWith('USDT')) return false;
      if (EXCLUDE_SYMBOLS.has(sym)) return false;
      const base = sym.slice(0, -4);
      if (hlMap && !hlMap.has(base)) return false;
      if (EXCLUDE_SUFFIXES.some((sfx) => base.endsWith(sfx))) return false;
      return parseFloat(t.quoteVolume) >= MIN_VOLUME_USDT;
    })
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, STAGE1_LIMIT);

  const passedStage1 = stage1.length;

  // Stage 2: quick RSI + volume check — loose pre-filter, real filtering is post-analysis
  // Accept any asset with non-extreme RSI (10-90) and minimal volume activity.
  // The post-analysis gates (score, streak, ADX, EMA bounce, conviction tier) do the real work.
  const stage2Results = await runConcurrent(
    stage1,
    async (t) => {
      const klines = await fetchKlines(t.symbol, '1h', 22);
      if (!klines) return null;
      const rsi = calculateRsi(klines.closes);
      const volR = volumeRatio(klines.vols);
      if (rsi >= 10 && rsi <= 90 && volR >= 0.4) {
        return { sym: t.symbol, rsi, volR, ticker: t };
      }
      return null;
    },
    12
  );

  const stage2 = stage2Results
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => {
      const scoreA = a.volR * (1 + Math.min(Math.abs(a.rsi - 30), Math.abs(a.rsi - 50), Math.abs(a.rsi - 70)) / 80);
      const scoreB = b.volR * (1 + Math.min(Math.abs(b.rsi - 30), Math.abs(b.rsi - 50), Math.abs(b.rsi - 70)) / 80);
      return scoreB - scoreA;
    });

  const passedStage2 = stage2.length;
  const deepTargets = stage2.slice(0, DEEP_LIMIT);

  // Deep dive — analyzeAsset already filters out conflicting trends and funding vetoes
  const deepResults = (await runConcurrent(
    deepTargets,
    (item) => analyzeAsset(item.sym, item.ticker, prevState, thresholds, hlMap),
    MAX_CONCURRENT
  )).filter((r): r is NonNullable<typeof r> => r !== null);

  const deepDived = deepResults.length;
  deepResults.sort((a, b) => b.finalScore - a.finalScore);

  // ── Save state for ALL analyzed assets BEFORE applying post-analysis gates ──
  // This ensures streak keeps accumulating even when filtered by BTC gate or score floor,
  // so the signal can qualify on the next scan if conditions improve.
  const newState: ScanState = {};
  for (const opp of deepResults) {
    newState[opp._symbol] = { finalScore: opp._finalScore, scanStreak: opp.scanStreak };
  }
  saveState(newState);

  // ── Update market stats ring buffer ──────────────────────────────────────────
  // Collect RSI and volume readings from all deep-analyzed assets to feed adaptive thresholds
  for (const opp of deepResults) {
    marketStats.rsi.push(opp.technicals.rsi1h);
    marketStats.volRatio.push(opp.technicals.volRatio1h);
  }
  // Also append Stage 2 readings (broader sample)
  for (const item of stage2Results.filter(Boolean) as NonNullable<(typeof stage2Results)[number]>[]) {
    marketStats.rsi.push(item.rsi);
    marketStats.volRatio.push(item.volR);
  }
  // Trim to window and save
  if (marketStats.rsi.length > STATS_WINDOW) marketStats.rsi = marketStats.rsi.slice(-STATS_WINDOW);
  if (marketStats.volRatio.length > STATS_WINDOW) marketStats.volRatio = marketStats.volRatio.slice(-STATS_WINDOW);
  marketStats.updatedAt = scanTime;
  saveMarketStats(marketStats);

  // ── BTC 4H trend for correlation gate ────────────────────────────────────────
  const [btcKlines1h, btcKlines4h] = await Promise.all([
    fetchKlines('BTCUSDT', '1h', 3),
    fetchKlines('BTCUSDT', '4h', 55),
  ]);

  let btcTrend = 'FLAT';
  let btcChg1h = 0;
  if (btcKlines1h && btcKlines1h.closes.length >= 2) {
    const bc = btcKlines1h.closes;
    btcTrend = bc[bc.length - 1] > bc[bc.length - 2] ? 'UP' : 'DOWN';
    btcChg1h = bc[bc.length - 2] > 0
      ? Math.round((bc[bc.length - 1] - bc[bc.length - 2]) / bc[bc.length - 2] * 100 * 100) / 100 : 0;
  }

  let btcTrend4h = 'FLAT';
  if (btcKlines4h && btcKlines4h.closes.length >= 20) {
    const c4h = btcKlines4h.closes;
    const ema20 = calculateEma(c4h, 20);
    const ema50 = calculateEma(c4h, Math.min(50, c4h.length));
    const curr = c4h[c4h.length - 1];
    if (curr > ema20 && ema20 > ema50) btcTrend4h = 'UP';
    else if (curr < ema20 && ema20 < ema50) btcTrend4h = 'DOWN';
  }

  // ── Post-analysis quality gates ───────────────────────────────────────────
  // Applied AFTER state is saved so streaks accumulate independently
  const gateDrops = {
    btc: 0,
    regime: 0,
    adx: 0,
    score: 0,
    streak: 0,
    volume: 0,
    ema: 0,
  };

  // BTC 4H trend strength: only veto when BTC has a strong 4H trend (EMA spread > 0.5%)
  let btcTrendStrength4h = 0;
  if (btcKlines4h && btcKlines4h.closes.length >= 50) {
    const c4h = btcKlines4h.closes;
    const btcEma20 = calculateEma(c4h, 20);
    const btcEma50 = calculateEma(c4h, 50);
    btcTrendStrength4h = Math.abs(btcEma20 - btcEma50) / btcEma50 * 100;
  }
  const BTC_GATE_ENABLED = btcTrendStrength4h >= 1.0; // Only veto on strong BTC trend (>1% EMA spread)

  const qualified = deepResults.filter((opp) => {
    // 1. BTC correlation gate — only when BTC has strong directional 4H trend
    if (BTC_GATE_ENABLED && btcTrend4h === 'DOWN' && opp.direction === 'LONG') { gateDrops.btc++; return false; }
    if (BTC_GATE_ENABLED && btcTrend4h === 'UP' && opp.direction === 'SHORT') { gateDrops.btc++; return false; }
    // 2. Regime gate — no signals in RANGING markets (ADX < 20, no trend to trade)
    if (BLOCK_RANGING_REGIME && opp.regime === 'RANGING') { gateDrops.regime++; return false; }
    // 3. ADX floor — TRENDING regime must have meaningful directional strength
    if (opp.regime === 'TRENDING' && opp.technicals.adx4h < MIN_ADX_TRENDING) { gateDrops.adx++; return false; }
    // 4. Minimum absolute score floor (raised by 30 in VOLATILE regimes)
    const scoreFloor = opp.regime === 'VOLATILE' ? MIN_SCORE + VOLATILE_SCORE_BONUS : MIN_SCORE;
    if (opp._finalScore < scoreFloor) { gateDrops.score++; return false; }
    // 5. Scan streak — must appear in N consecutive scans to filter one-scan flukes
    if (opp.scanStreak < MIN_SCAN_STREAK) { gateDrops.streak++; return false; }
    // 6. Volume must be at or above average — below-average volume signals lack follow-through
    if (opp.technicals.volRatio1h < MIN_VOL_RATIO) { gateDrops.volume++; return false; }
    // 7. EMA bounce system gate (1H/2H/4H EMA200 + 1D EMA50 confluence)
    if (REQUIRE_EMA_BOUNCE && !opp.technicals.emaBounce.isValid) { gateDrops.ema++; return false; }
    return true;
  });

  // ── Assign conviction tiers ────────────────────────────────────────────────
  for (const opp of qualified) {
    const isATier = opp.swingGrade
      || (opp._finalScore >= A_TIER_MIN_SCORE && opp.scanStreak >= A_TIER_MIN_STREAK && opp.technicals.adx4h >= A_TIER_MIN_ADX);
    (opp as any).convictionTier = isATier ? 'A' : 'B';
  }

  if (isDebugGates()) {
    console.log('[opportunity-scan] BTC 4H:', btcTrend4h, 'strength:', btcTrendStrength4h.toFixed(3) + '%', 'gate:', BTC_GATE_ENABLED ? 'ON' : 'OFF');
    console.log('[opportunity-scan] gate drops', gateDrops, 'deepResults', deepResults.length, 'qualified', qualified.length);
    for (const opp of deepResults) {
      const scoreFloor = opp.regime === 'VOLATILE' ? MIN_SCORE + VOLATILE_SCORE_BONUS : MIN_SCORE;
      const reason =
        (BTC_GATE_ENABLED && ((btcTrend4h === 'DOWN' && opp.direction === 'LONG') || (btcTrend4h === 'UP' && opp.direction === 'SHORT'))) ? 'btc' :
        (BLOCK_RANGING_REGIME && opp.regime === 'RANGING') ? 'regime' :
        (opp.regime === 'TRENDING' && opp.technicals.adx4h < MIN_ADX_TRENDING) ? 'adx' :
        opp._finalScore < scoreFloor ? 'score' :
        opp.scanStreak < MIN_SCAN_STREAK ? 'streak' :
        opp.technicals.volRatio1h < MIN_VOL_RATIO ? 'volume' :
        (REQUIRE_EMA_BOUNCE && !opp.technicals.emaBounce.isValid) ? 'ema' : 'pass';
      console.log(
        '[opportunity-scan] candidate',
        opp.asset,
        'score',
        opp._finalScore,
        'floor',
        scoreFloor,
        'regime',
        opp.regime,
        'streak',
        opp.scanStreak,
        'adx',
        opp.technicals.adx4h,
        'vol',
        opp.technicals.volRatio1h,
        'ema',
        `${opp.technicals.emaBounce.confluence}/${opp.technicals.emaBounce.required}`,
        '->',
        reason,
        'tier',
        (opp as any).convictionTier ?? '-',
      );
    }
  }

  const filteredByGates = deepResults.length - qualified.length;
  const topOpps = qualified.slice(0, TOP_OUTPUT);

  const btcTicker = tickerMap.get('BTCUSDT');

  // Strip internal fields before returning
  const clean = topOpps.map(({ _symbol: _s, _finalScore: _f, ...rest }) => rest) as OpportunityResult[];

  return {
    scanTime,
    assetsScanned,
    passedStage1,
    passedStage2,
    deepDived,
    disqualified: assetsScanned - deepResults.length,
    filteredByGates,
    btcContext: {
      price: btcTicker ? Math.round(parseFloat(btcTicker.lastPrice) * 100) / 100 : 0,
      trend: btcTrend,
      trend4h: btcTrend4h,
      change1h: btcChg1h,
      change24h: btcTicker ? Math.round(parseFloat(btcTicker.priceChangePercent) * 100) / 100 : 0,
    },
    opportunities: clean,
  };
}
