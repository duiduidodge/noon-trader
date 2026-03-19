/**
 * Walk-forward replay engine.
 * Slides a train/test window over historical kline data, fires signals via
 * evaluateSignal(), simulates position management, and collects TradeResult[].
 */

import type { Kline } from './data-fetcher.js';
import { evaluateSignal } from './signal-evaluator.js';
import type { TradeResult } from './metrics.js';
import {
  computeThresholds,
  calculateRsi,
  volumeRatio,
  type AdaptiveThresholds,
  type MarketStatsSamples,
  DEFAULT_THRESHOLDS,
} from '@noon-trader/trading';

export interface WalkForwardConfig {
  trainDays: number;   // default 180
  testDays: number;    // default 30
  stepDays: number;    // default 30
  symbols: string[];
  thresholdOverride?: Partial<AdaptiveThresholds>;
}

const DEFAULT_CONFIG: Omit<WalkForwardConfig, 'symbols'> = {
  trainDays: 180,
  testDays: 30,
  stepDays: 30,
};

interface OpenPosition {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryTime: number;
  entryPrice: number;
  sl: number;
  tp1: number;
  tp2: number;
  maxHoldMs: number;
  regime: TradeResult['regime'];
  finalScore: number;
  riskPct: number;
  partialExit: boolean; // true after TP1 hit (partial close)
}

/**
 * Simulate position management on subsequent candles after entry.
 * Returns exit details or null if position should remain open.
 */
function checkExit(
  pos: OpenPosition,
  candle: Kline,
): { exitTime: number; exitPrice: number; exitReason: TradeResult['exitReason'] } | null {
  const { direction, sl, tp1, tp2, maxHoldMs, entryTime, partialExit } = pos;
  const { time, high, low, close } = candle;

  // Time-based exit
  if (time - entryTime >= maxHoldMs) {
    return { exitTime: time, exitPrice: close, exitReason: 'TIME' };
  }

  if (direction === 'LONG') {
    // SL check (use low of candle)
    if (low <= sl) {
      return { exitTime: time, exitPrice: sl, exitReason: 'SL' };
    }
    // TP1 (if partial not yet done)
    if (!partialExit && high >= tp1) {
      return { exitTime: time, exitPrice: tp1, exitReason: 'TP1' };
    }
    // TP2 (only after TP1 partial)
    if (partialExit && high >= tp2) {
      return { exitTime: time, exitPrice: tp2, exitReason: 'TP2' };
    }
  } else {
    // SHORT
    if (high >= sl) {
      return { exitTime: time, exitPrice: sl, exitReason: 'SL' };
    }
    if (!partialExit && low <= tp1) {
      return { exitTime: time, exitPrice: tp1, exitReason: 'TP1' };
    }
    if (partialExit && low <= tp2) {
      return { exitTime: time, exitPrice: tp2, exitReason: 'TP2' };
    }
  }

  return null;
}

function msPerDay(days: number): number {
  return days * 24 * 3_600_000;
}

/**
 * Run walk-forward simulation across all symbols.
 * Returns all simulated trades.
 */
export function runWalkForward(
  klineData: Map<string, Map<string, Kline[]>>,
  config: Partial<WalkForwardConfig> & { symbols: string[] },
): TradeResult[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const allTrades: TradeResult[] = [];

  // Determine global time range from data
  let globalStart = Infinity;
  let globalEnd = -Infinity;
  for (const intervalMap of klineData.values()) {
    const klines1h = intervalMap.get('1h') ?? [];
    if (klines1h.length > 0) {
      globalStart = Math.min(globalStart, klines1h[0].time);
      globalEnd = Math.max(globalEnd, klines1h[klines1h.length - 1].time);
    }
  }

  if (!isFinite(globalStart)) return [];

  const trainMs = msPerDay(cfg.trainDays);
  const testMs  = msPerDay(cfg.testDays);
  const stepMs  = msPerDay(cfg.stepDays);

  let windowStart = globalStart;
  let windowNum = 0;

  while (windowStart + trainMs + testMs <= globalEnd) {
    const trainEnd = windowStart + trainMs;
    const testEnd  = trainEnd + testMs;
    windowNum++;

    process.stdout.write(`\n[Window ${windowNum}] Train: ${new Date(windowStart).toISOString().slice(0, 10)} → ${new Date(trainEnd).toISOString().slice(0, 10)}  Test: → ${new Date(testEnd).toISOString().slice(0, 10)}\n`);

    // Compute adaptive thresholds from training period
    const thresholds = cfg.thresholdOverride
      ? { ...DEFAULT_THRESHOLDS, ...cfg.thresholdOverride }
      : computeAdaptiveThresholds(klineData, cfg.symbols, windowStart, trainEnd);

    // Run test period per symbol
    for (const symbol of cfg.symbols) {
      const intervalMap = klineData.get(symbol);
      if (!intervalMap) continue;

      const klines1h = intervalMap.get('1h') ?? [];
      const klines4h = intervalMap.get('4h') ?? [];

      // Filter to test window candles
      const testCandles1h = klines1h.filter(k => k.time >= trainEnd && k.time < testEnd);
      if (testCandles1h.length === 0) continue;

      // Build prefix of train candles for lookback (we need ≥50 history candles)
      const trainCandles1h = klines1h.filter(k => k.time >= windowStart && k.time < trainEnd);
      const trainCandles4h = klines4h.filter(k => k.time >= windowStart && k.time < trainEnd);

      // Open positions tracked for this symbol
      const openPositions: OpenPosition[] = [];

      for (let i = 0; i < testCandles1h.length; i++) {
        const candle = testCandles1h[i];
        const candle4h = klines4h.find(k => k.time <= candle.time);
        if (!candle4h) continue;

        // Build lookback slices up to (and including) current candle
        const slice1h = [
          ...trainCandles1h,
          ...testCandles1h.slice(0, i + 1),
        ].slice(-200); // keep last 200 candles

        const slice4h = [
          ...trainCandles4h,
          ...klines4h.filter(k => k.time <= candle.time && k.time >= windowStart),
        ].slice(-200);

        // Check exits for open positions
        const stillOpen: OpenPosition[] = [];
        for (const pos of openPositions) {
          const exit = checkExit(pos, candle);
          if (exit) {
            const riskDist = Math.abs(pos.entryPrice - pos.sl);
            const riskPct  = riskDist / pos.entryPrice * 100;
            const pnlRaw   = pos.direction === 'LONG'
              ? (exit.exitPrice - pos.entryPrice) / pos.entryPrice * 100
              : (pos.entryPrice - exit.exitPrice) / pos.entryPrice * 100;
            const rMultiple = riskPct > 0 ? pnlRaw / riskPct : 0;

            allTrades.push({
              symbol: pos.symbol,
              direction: pos.direction,
              entryTime: pos.entryTime,
              exitTime: exit.exitTime,
              entryPrice: pos.entryPrice,
              exitPrice: exit.exitPrice,
              pnlPct: Math.round(pnlRaw * 100) / 100,
              riskPct: Math.round(riskPct * 100) / 100,
              rMultiple: Math.round(rMultiple * 100) / 100,
              exitReason: exit.exitReason,
              regime: pos.regime,
              finalScore: pos.finalScore,
            });

            // If TP1, mark partial and keep position open for TP2
            if (exit.exitReason === 'TP1') {
              stillOpen.push({ ...pos, partialExit: true });
            }
          } else {
            stillOpen.push(pos);
          }
        }
        openPositions.length = 0;
        openPositions.push(...stillOpen);

        // Evaluate for new signal (skip if already have open position for this symbol)
        const alreadyOpen = openPositions.some(p => p.symbol === symbol);
        if (alreadyOpen) continue;

        const signal = evaluateSignal(symbol, candle.time, slice1h, slice4h, thresholds);
        if (!signal) continue;

        const { exitLevels, regime, finalScore, entryPrice, direction } = signal;
        openPositions.push({
          symbol,
          direction,
          entryTime: candle.time,
          entryPrice,
          sl: exitLevels.initialSL,
          tp1: exitLevels.tp1,
          tp2: exitLevels.tp2,
          maxHoldMs: exitLevels.maxHoldHours * 3_600_000,
          regime,
          finalScore,
          riskPct: exitLevels.riskPct,
          partialExit: false,
        });
      }

      // Force-close any remaining positions at end of test window
      const lastCandle = testCandles1h[testCandles1h.length - 1];
      if (lastCandle) {
        for (const pos of openPositions) {
          const riskDist = Math.abs(pos.entryPrice - pos.sl);
          const riskPct  = riskDist / pos.entryPrice * 100;
          const pnlRaw   = pos.direction === 'LONG'
            ? (lastCandle.close - pos.entryPrice) / pos.entryPrice * 100
            : (pos.entryPrice - lastCandle.close) / pos.entryPrice * 100;
          const rMultiple = riskPct > 0 ? pnlRaw / riskPct : 0;

          allTrades.push({
            symbol: pos.symbol,
            direction: pos.direction,
            entryTime: pos.entryTime,
            exitTime: lastCandle.time,
            entryPrice: pos.entryPrice,
            exitPrice: lastCandle.close,
            pnlPct: Math.round(pnlRaw * 100) / 100,
            riskPct: Math.round(riskPct * 100) / 100,
            rMultiple: Math.round(rMultiple * 100) / 100,
            exitReason: 'TIME',
            regime: pos.regime,
            finalScore: pos.finalScore,
          });
        }
      }
    }

    windowStart += stepMs;
  }

  return allTrades;
}

/**
 * Compute adaptive thresholds from training window kline data.
 * Mirrors the scanner's in-memory approach using RSI and volume readings.
 */
function computeAdaptiveThresholds(
  klineData: Map<string, Map<string, Kline[]>>,
  symbols: string[],
  startMs: number,
  endMs: number,
): AdaptiveThresholds {
  const rsiSamples: number[] = [];
  const volRatioSamples: number[] = [];

  for (const symbol of symbols) {
    const intervalMap = klineData.get(symbol);
    if (!intervalMap) continue;
    const klines = (intervalMap.get('1h') ?? []).filter(k => k.time >= startMs && k.time < endMs);
    if (klines.length < 20) continue;

    const closes = klines.map(k => k.close);
    const volumes = klines.map(k => k.volume);

    // RSI samples every 5 candles to reduce autocorrelation
    for (let i = 30; i < closes.length; i += 5) {
      const rsi = calculateRsi(closes.slice(Math.max(0, i - 50), i + 1));
      if (rsi > 0) rsiSamples.push(rsi);
    }

    // Volume ratio samples
    for (let i = 20; i < volumes.length; i += 5) {
      const vr = volumeRatio(volumes.slice(Math.max(0, i - 20), i + 1));
      volRatioSamples.push(vr);
    }
  }

  const samples: MarketStatsSamples = {
    rsi: rsiSamples, volRatio: volRatioSamples, atrPct: [], funding: [], chg24h: [],
  };
  return computeThresholds(samples);
}
