/**
 * Pure scoring functions extracted from opportunity-scanner.ts
 * No side effects, no I/O — safe to import in backtest and test contexts.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_FUNDING_ANNUALIZED = 100; // % — hard veto for crowded longs

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PivotPoints {
  pp: number; s1: number; r1: number; s2: number; r2: number;
}

export type MarketRegime = 'TRENDING' | 'RANGING' | 'VOLATILE';

export interface ExitLevels {
  initialSL: number;
  trailingSLPct: number;
  tp1: number;
  tp2: number;
  maxHoldHours: number;
  riskPct: number;
}

export interface PositionSize {
  riskPct: number;
  positionPct: number;
  dollarRisk10k: number;
}

export interface AdaptiveThresholds {
  rsiLow: number;
  rsiHigh: number;
  volSpikeRatio: number;
}

export const DEFAULT_THRESHOLDS: AdaptiveThresholds = {
  rsiLow: 25,
  rsiHigh: 78,
  volSpikeRatio: 2.5,
};

// ─── Technical indicators ─────────────────────────────────────────────────────

export function calculateRsi(closes: number[], period = 14): number {
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

export function calculateEma(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (const price of closes.slice(period)) ema = price * k + ema * (1 - k);
  return ema;
}

export function calculateAtrPct(highs: number[], lows: number[], closes: number[], period = 14): number {
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

export function volumeRatio(vols: number[]): number {
  if (vols.length < 3) return 1;
  const baseline = vols.slice(0, -1).slice(-20);
  const avg = baseline.reduce((a, b) => a + b, 0) / (baseline.length || 1);
  return avg > 0 ? Math.round((vols[vols.length - 1] / avg) * 100) / 100 : 1;
}

export function detectPatterns(
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

export function calculatePivotPoints(highs: number[], lows: number[], closes: number[]): PivotPoints | null {
  if (highs.length < 2) return null;
  const i = highs.length - 2;
  const high = highs[i], low = lows[i], close = closes[i];
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

export function calculateWeeklyPivotPoints(highs: number[], lows: number[], closes: number[]): PivotPoints | null {
  const n = highs.length;
  if (n < 9) return null;
  const weekHigh = Math.max(...highs.slice(-8, -1));
  const weekLow  = Math.min(...lows.slice(-8, -1));
  const weekClose = closes[n - 2];
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

export function calculateAdx(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < period * 2 + 2) return 25;
  const plusDM: number[] = [], minusDM: number[] = [], trArr: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const upMove   = highs[i]  - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trArr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  let smTr     = trArr.slice(0, period).reduce((a, b) => a + b, 0);
  let smPlusDM  = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  const dxArr: number[] = [];
  for (let i = period; i < trArr.length; i++) {
    smTr      = smTr      - smTr / period      + trArr[i];
    smPlusDM  = smPlusDM  - smPlusDM / period  + plusDM[i];
    smMinusDM = smMinusDM - smMinusDM / period + minusDM[i];
    const plusDI  = smTr > 0 ? (smPlusDM / smTr) * 100 : 0;
    const minusDI = smTr > 0 ? (smMinusDM / smTr) * 100 : 0;
    const sumDI = plusDI + minusDI;
    dxArr.push(sumDI > 0 ? Math.abs(plusDI - minusDI) / sumDI * 100 : 0);
  }
  if (dxArr.length < period) return 25;
  return Math.round(dxArr.slice(-period).reduce((a, b) => a + b, 0) / period * 10) / 10;
}

// ─── Classification ───────────────────────────────────────────────────────────

export function classifyRegime(adx4h: number, atrPct14: number, atrPct50: number): MarketRegime {
  const atrRatio = atrPct50 > 0 ? atrPct14 / atrPct50 : 1;
  if (adx4h >= 25 && atrRatio < 1.8) return 'TRENDING';
  if (adx4h < 20  && atrRatio < 1.2) return 'RANGING';
  return 'VOLATILE';
}

export function recommendLeverage(atrPct: number, regime: MarketRegime): number {
  const base = atrPct > 3 ? 3 : atrPct > 2 ? 5 : atrPct > 1 ? 8 : 10;
  return regime === 'VOLATILE' ? Math.max(3, base - (base <= 5 ? 1 : 2)) : base;
}

export function chooseDirection(
  rsi1h: number | null, trend4h: string, trend1h: string,
  topLs: number | null, takerR: number | null
): 'LONG' | 'SHORT' | null {
  if (trend4h !== 'FLAT' && trend1h !== 'FLAT' && trend4h !== trend1h) return null;
  let longV = 0, shortV = 0;
  if (trend4h === 'UP') longV += 2; else if (trend4h === 'DOWN') shortV += 2;
  if (trend1h === 'UP') longV += 1; else if (trend1h === 'DOWN') shortV += 1;
  if (rsi1h !== null) { if (rsi1h < 40) longV++; else if (rsi1h > 65) shortV++; }
  if (topLs !== null) { if (topLs > 1.2) longV++; else if (topLs < 0.8) shortV++; }
  if (takerR !== null) { if (takerR > 1.1) longV++; else if (takerR < 0.9) shortV++; }
  if (Math.abs(longV - shortV) < 2) return null;
  return longV > shortV ? 'LONG' : 'SHORT';
}

export function evaluateSwingGrade(
  direction: string, trendAligned: boolean, trendDaily: string,
  rsi1d: number, finalScore: number,
): boolean {
  if (!trendAligned) return false;
  const dailyAligned =
    (trendDaily === 'UP' && direction === 'LONG') ||
    (trendDaily === 'DOWN' && direction === 'SHORT');
  if (!dailyAligned) return false;
  if (rsi1d < 35 || rsi1d > 65) return false;
  if (finalScore < 240) return false;
  return true;
}

// ─── Exit levels ──────────────────────────────────────────────────────────────

export function calculateExitLevels(
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
    const pivotSL = pivots?.s1 ?? (currentPrice - slDist);
    const atrSL   = currentPrice - slDist;
    slPrice = Math.max(pivotSL, atrSL);
    slPrice = Math.min(slPrice, currentPrice * 0.98);
  } else {
    const pivotSL = pivots?.r1 ?? (currentPrice + slDist);
    const atrSL   = currentPrice + slDist;
    slPrice = Math.min(pivotSL, atrSL);
    slPrice = Math.max(slPrice, currentPrice * 1.02);
  }
  const riskDist = Math.abs(currentPrice - slPrice);
  const riskPct  = currentPrice > 0 ? Math.round(riskDist / currentPrice * 100 * 100) / 100 : 1;
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
    tp1, tp2, maxHoldHours, riskPct,
  };
}

export function calculatePositionSize(finalScore: number, exitLevels: ExitLevels): PositionSize {
  const scoreRatio = Math.min(1, Math.max(0, finalScore / 300));
  const riskPct = Math.round((0.5 + scoreRatio * 1.5) * 100) / 100;
  const slDistPct = exitLevels.riskPct;
  const positionPct = slDistPct > 0
    ? Math.min(25, Math.round(riskPct / (slDistPct / 100) * 100) / 100)
    : 5;
  const dollarRisk10k = Math.round(10000 * riskPct / 100 * 100) / 100;
  return { riskPct, positionPct, dollarRisk10k };
}

// ─── Scoring (3-pillar) ───────────────────────────────────────────────────────

export interface DerivativesResult {
  score: number; risks: string[]; hardVeto: boolean; annualized: number; favorable: boolean;
}

export function scoreDerivatives(
  direction: string,
  fundingRate: number | null,
  oiChg: number | null,
  topLs: number | null,
  takerR: number | null,
  chg1h: number,
  chg24h: number,
  atrPct: number,
  hlData: { funding: number; openInterest: number; dayVolume: number } | null = null,
): DerivativesResult {
  const risks: string[] = [];
  let hardVeto = false, annualized = 0, favorable = false;

  const chaseVeto = Math.max(15, atrPct * 5);
  const chaseSoft = Math.max(8, atrPct * 3);
  const chg24hInDir =
    (direction === 'LONG' && chg24h > 0) ? chg24h :
    (direction === 'SHORT' && chg24h < 0) ? Math.abs(chg24h) : 0;
  if (chg24hInDir > chaseVeto) { hardVeto = true; risks.push('chasing_pump'); }
  else if (chg24hInDir > chaseSoft) risks.push('chasing_pump');

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

  let oiAdj = 0;
  if (oiChg !== null) {
    const priceAligned  = (direction === 'LONG' && chg1h > 0) || (direction === 'SHORT' && chg1h < 0);
    const priceDiverges = (direction === 'LONG' && chg1h < 0) || (direction === 'SHORT' && chg1h > 0);
    if (oiChg > 5) {
      if (priceAligned)       oiAdj = 15;
      else if (priceDiverges) { oiAdj = -15; risks.push('oi_price_divergence'); }
      else                    oiAdj = 5;
    } else if (oiChg > 2) { oiAdj = 8; }
    else if (oiChg < -5)   { oiAdj = -10; }
  }

  let lsAdj = 0;
  if (topLs !== null) {
    const ratio = direction === 'LONG' ? topLs : (topLs > 0 ? 1 / topLs : 1);
    if      (ratio >= 1.5) lsAdj = 12;
    else if (ratio >= 1.2) lsAdj = 8;
    else if (ratio >= 1.0) lsAdj = 3;
    else if (ratio >= 0.8) lsAdj = -3;
    else                   lsAdj = -10;
  }

  let takerAdj = 0;
  if (takerR !== null) {
    const aligned = (direction === 'LONG' && takerR > 1.1) || (direction === 'SHORT' && takerR < 0.9);
    const opposed = (direction === 'LONG' && takerR < 0.9) || (direction === 'SHORT' && takerR > 1.1);
    if (aligned)      takerAdj = 8;
    else if (opposed) takerAdj = -5;
  }

  let hlAdj = 0;
  if (hlData && fundingRate !== null) {
    const binanceSign = fundingRate > 0.00001 ? 1 : fundingRate < -0.00001 ? -1 : 0;
    const hlSign = hlData.funding > 0.00001 ? 1 : hlData.funding < -0.00001 ? -1 : 0;
    if (binanceSign !== 0 && hlSign !== 0 && binanceSign !== hlSign) {
      risks.push('hl_funding_divergence'); hlAdj = -5;
    } else if (binanceSign !== 0 && hlSign === binanceSign && favorable) {
      hlAdj = 3;
    }
  }

  const score = Math.min(100, Math.max(0, 50 + fAdj + oiAdj + lsAdj + takerAdj + hlAdj));
  if (score < 35) hardVeto = true;
  return { score, risks, hardVeto, annualized, favorable };
}

export function scoreStructure(
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

export function scoreTechnicals(
  direction: string,
  rsi1h: number | null,
  rsi15m: number | null,
  volR: number | null,
  volSpikeRatio = 2.5,
): { score: number; risks: string[] } {
  const risks: string[] = [];
  let tech = 50;
  if (rsi1h !== null) {
    if (direction === 'LONG') {
      if (rsi1h >= 45 && rsi1h <= 65)      tech = 72;
      else if (rsi1h >= 30 && rsi1h < 45)  tech = 78;
      else if (rsi1h < 30)                  tech = 62;
      else if (rsi1h > 75) { tech = 32; risks.push('overbought_rsi'); }
      else                                  tech = 55;
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
    if (volR >= volSpikeRatio)    tech = Math.min(100, tech + 15);
    else if (volR >= 1.5)         tech = Math.min(100, tech + 8);
    else if (volR < 0.6)          { tech = Math.max(0, tech - 15); risks.push('low_volume'); }
  }
  return { score: tech, risks };
}

// ─── Adaptive threshold computation ──────────────────────────────────────────

export interface MarketStatsSamples {
  rsi: number[];
  volRatio: number[];
  atrPct: number[];
  funding: number[];
  chg24h: number[];
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p / 100);
  return sorted[Math.min(idx, sorted.length - 1)];
}

/**
 * Compute adaptive thresholds from collected market stat samples.
 * Falls back to DEFAULT_THRESHOLDS when insufficient data.
 */
export function computeThresholds(samples: MarketStatsSamples): AdaptiveThresholds {
  const MIN_SAMPLES = 50;
  if (samples.rsi.length < MIN_SAMPLES) return { ...DEFAULT_THRESHOLDS };

  const sortedRsi = [...samples.rsi].sort((a, b) => a - b);
  const sortedVol = [...samples.volRatio].sort((a, b) => a - b);

  return {
    rsiLow:       Math.round(percentile(sortedRsi, 15) * 10) / 10,
    rsiHigh:      Math.round(percentile(sortedRsi, 85) * 10) / 10,
    volSpikeRatio: Math.round(percentile(sortedVol, 90) * 100) / 100,
  };
}
