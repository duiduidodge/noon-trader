/**
 * Signal evaluator: applies the 3-pillar scoring to historical kline slices.
 * Imports pure functions from scoring-functions.ts (no scanner I/O side effects).
 */

import type { Kline } from './data-fetcher.js';
import {
  calculateRsi, calculateEma, calculateAtrPct, calculateAdx,
  volumeRatio, calculatePivotPoints,
  classifyRegime, chooseDirection,
  scoreDerivatives, scoreStructure, scoreTechnicals,
  calculateExitLevels, calculatePositionSize,
  type AdaptiveThresholds, type ExitLevels, type PositionSize,
  DEFAULT_THRESHOLDS,
} from '@noon-trader/trading';

export interface SignalCandidate {
  symbol: string;
  time: number;         // candle open timestamp
  direction: 'LONG' | 'SHORT';
  finalScore: number;
  entryPrice: number;
  exitLevels: ExitLevels;
  positionSize: PositionSize;
  regime: 'TRENDING' | 'RANGING' | 'VOLATILE';
}

/**
 * Evaluate a single point-in-time snapshot of kline data.
 * Returns a signal candidate if all quality gates pass, else null.
 */
export function evaluateSignal(
  symbol: string,
  time: number,
  klines1h: Kline[],
  klines4h: Kline[],
  thresholds: AdaptiveThresholds = DEFAULT_THRESHOLDS,
  // Derivatives inputs not available in backtest (no live L/S ratio history)
  // Pass null to fall back to technicals+structure only
  fundingRate: number | null = null,
  oiChg: number | null = null,
  topLs: number | null = null,
  takerR: number | null = null,
): SignalCandidate | null {
  if (klines1h.length < 30 || klines4h.length < 30) return null;

  const c1h = klines1h.map(k => k.close);
  const h1h = klines1h.map(k => k.high);
  const l1h = klines1h.map(k => k.low);
  const v1h = klines1h.map(k => k.volume);

  const rsi1h = calculateRsi(c1h);
  const volR   = volumeRatio(v1h);

  // Stage 2 pre-filter
  if (rsi1h < thresholds.rsiLow || rsi1h > thresholds.rsiHigh || volR < 0.6) return null;

  const atrPct   = calculateAtrPct(h1h, l1h, c1h);
  const atrPct50 = calculateAtrPct(h1h, l1h, c1h, 50);

  const c4h = klines4h.map(k => k.close);
  const h4h = klines4h.map(k => k.high);
  const l4h = klines4h.map(k => k.low);
  const adx4h = calculateAdx(h4h, l4h, c4h);

  // Trend computation
  let trend4h = 'FLAT', trend1h = 'FLAT';
  if (c4h.length >= 20) {
    const ema20 = calculateEma(c4h, 20);
    const ema50 = calculateEma(c4h, Math.min(50, c4h.length));
    const curr  = c4h[c4h.length - 1];
    if (curr > ema20 && ema20 > ema50) trend4h = 'UP';
    else if (curr < ema20 && ema20 < ema50) trend4h = 'DOWN';
  }
  if (c1h.length >= 21) {
    const ema9  = calculateEma(c1h, 9);
    const ema21 = calculateEma(c1h, 21);
    const curr  = c1h[c1h.length - 1];
    if (curr > ema9 && ema9 > ema21) trend1h = 'UP';
    else if (curr < ema9 && ema9 < ema21) trend1h = 'DOWN';
  }

  const direction = chooseDirection(rsi1h, trend4h, trend1h, topLs, takerR);
  if (!direction) return null;

  const pivots = calculatePivotPoints(h4h, l4h, c4h);
  const regime  = classifyRegime(adx4h, atrPct, atrPct50);
  if (regime === 'RANGING') return null;

  const chg1h  = c1h.length > 1 && c1h[c1h.length - 2] > 0
    ? (c1h[c1h.length - 1] - c1h[c1h.length - 2]) / c1h[c1h.length - 2] * 100 : 0;
  const chg24h = c1h.length > 25 && c1h[c1h.length - 25] > 0
    ? (c1h[c1h.length - 1] - c1h[c1h.length - 25]) / c1h[c1h.length - 25] * 100 : 0;

  const { score: derivScore, hardVeto } = scoreDerivatives(
    direction, fundingRate, oiChg, topLs, takerR, chg1h, chg24h, atrPct, null
  );
  if (hardVeto) return null;

  const { score: structScore } = scoreStructure(direction, trend4h, trend1h, volR, adx4h);
  const { score: techScore } = scoreTechnicals(direction, rsi1h, null, volR, thresholds.volSpikeRatio);

  const currentPrice = c1h[c1h.length - 1];

  // Entry bonus from pivot proximity
  let entryBonus = 0;
  if (pivots) {
    if (direction === 'LONG') {
      const pctAboveS1 = (currentPrice - pivots.s1) / pivots.s1 * 100;
      if (pctAboveS1 < 0) entryBonus = 20;
      else if (pctAboveS1 < 1) entryBonus = 15;
      else if (pctAboveS1 < 3) entryBonus = 8;
    } else {
      const pctBelowR1 = (pivots.r1 - currentPrice) / pivots.r1 * 100;
      if (pctBelowR1 < 0) entryBonus = 20;
      else if (pctBelowR1 < 1) entryBonus = 15;
      else if (pctBelowR1 < 3) entryBonus = 8;
    }
  }

  const finalScore = derivScore + structScore + techScore + entryBonus;
  const scoreFloor = regime === 'VOLATILE' ? 255 : 225;
  if (finalScore < scoreFloor) return null;

  const exitLevels   = calculateExitLevels(currentPrice, direction, atrPct, pivots, regime);
  const positionSize = calculatePositionSize(finalScore, exitLevels);

  return { symbol, time, direction, finalScore, entryPrice: currentPrice, exitLevels, positionSize, regime };
}
