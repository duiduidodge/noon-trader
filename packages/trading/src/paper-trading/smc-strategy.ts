/**
 * SMC-based Strategy Engine
 *
 * Analyzes Smart Money Concepts signals across timeframes
 * and produces trade entry/exit decisions.
 *
 * Improvements over v1:
 * - Market regime filter (ADX) — only trades in trending markets
 * - Limit orders at zone edges instead of market entries
 * - Candle-close awareness — only evaluates on fresh candle data
 * - Better trailing stop using recent price action, not just confirmed swings
 */

import {
  swingHighsLows,
  fairValueGaps,
  orderBlocks,
  breakOfStructure,
  euphoriaCapitulation,
  type OhlcArrays,
} from '../smart-money-concepts.js';
import {
  calculateAtrPct,
  classifyRegime,
} from '../scoring-functions.js';
import type {
  SmcAnalysis,
  SmcEntrySignal,
  TradeDirection,
  PaperPosition,
  PaperTradingConfig,
  SignalRejectionReason,
} from './types.js';

export interface EntryDecision {
  signal: SmcEntrySignal | null;
  rejectionReason?: SignalRejectionReason;
}

// ── SMC Analysis ─────────────────────────────────────────────────────────────

export function analyzeSmcSetup(
  ohlc: OhlcArrays,
  asset: string,
  timeframe: string,
  swingLength = 5,
): SmcAnalysis {
  const swings = swingHighsLows(ohlc, swingLength);
  const fvgs = fairValueGaps(ohlc);
  const obs = orderBlocks(ohlc, swings);
  const bos = breakOfStructure(ohlc, swings);
  const ec = euphoriaCapitulation(ohlc);

  const currentPrice = ohlc.closes[ohlc.closes.length - 1];

  return {
    asset,
    timeframe,
    swings,
    fvgs,
    orderBlocks: obs,
    structureBreaks: bos,
    euphoriaCapitulation: ec,
    currentPrice,
    candleCount: ohlc.closes.length,
  };
}

// ── ADX Calculation (regime filter) ──────────────────────────────────────────

/**
 * Calculate ADX from OHLC data. Returns the latest ADX value.
 * Uses standard 14-period Wilder smoothing.
 */
export function calculateADX(ohlc: OhlcArrays, period = 14): number {
  const { highs, lows, closes } = ohlc;
  const len = highs.length;
  if (len < period * 2 + 1) return 0;

  // True Range, +DM, -DM
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < len; i++) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr.push(Math.max(hl, hc, lc));

    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Wilder smoothing
  const smooth = (arr: number[], p: number): number[] => {
    const result: number[] = [];
    let sum = 0;
    for (let i = 0; i < p; i++) sum += arr[i];
    result.push(sum);
    for (let i = p; i < arr.length; i++) {
      result.push(result[result.length - 1] - result[result.length - 1] / p + arr[i]);
    }
    return result;
  };

  const smoothTR = smooth(tr, period);
  const smoothPlusDM = smooth(plusDM, period);
  const smoothMinusDM = smooth(minusDM, period);

  // +DI, -DI, DX
  const dx: number[] = [];
  for (let i = 0; i < smoothTR.length; i++) {
    if (smoothTR[i] === 0) { dx.push(0); continue; }
    const pdi = (smoothPlusDM[i] / smoothTR[i]) * 100;
    const mdi = (smoothMinusDM[i] / smoothTR[i]) * 100;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }

  if (dx.length < period) return 0;

  // ADX = Wilder-smoothed DX
  let adx = 0;
  for (let i = 0; i < period; i++) adx += dx[i];
  adx /= period;
  for (let i = period; i < dx.length; i++) {
    adx = (adx * (period - 1) + dx[i]) / period;
  }

  return adx;
}

// ── Entry Signal Evaluation ──────────────────────────────────────────────────

/**
 * Evaluate whether the current SMC state produces a valid entry signal.
 * Uses confluence scoring: primary trigger + confirmations.
 *
 * v2 improvements:
 * - ADX regime filter rejects trades in ranging markets
 * - Determines optimal limit entry price at zone edge
 * - Multi-timeframe agreement tracked in confluence
 */
function regimeAdjustedMinScore(
  regime: 'TRENDING' | 'RANGING' | 'VOLATILE',
  config: PaperTradingConfig,
): number {
  if (regime === 'TRENDING') return Math.max(25, config.minEntryScore - 5);
  if (regime === 'RANGING') return config.minEntryScore + 5;
  return config.minEntryScore;
}

function regimeAdjustedMaxBosAge(
  regime: 'TRENDING' | 'RANGING' | 'VOLATILE',
  config: PaperTradingConfig,
): number {
  if (regime === 'TRENDING') return config.maxBosAgeCandles + 8;
  if (regime === 'RANGING') return Math.max(20, config.maxBosAgeCandles - 8);
  return config.maxBosAgeCandles;
}

export function evaluateEntryDecision(
  primarySmc: SmcAnalysis,
  higherTfSmc: SmcAnalysis,
  primaryOhlc: OhlcArrays,
  config: PaperTradingConfig,
): EntryDecision {
  const price = primarySmc.currentPrice;
  const { structureBreaks, fvgs, orderBlocks: obs, swings, euphoriaCapitulation: ec } = primarySmc;

  if (structureBreaks.length === 0) return { signal: null, rejectionReason: 'no_structure' };

  // ── Regime filter: reject ranging markets ────────────────────────────────
  const adx = calculateADX(primaryOhlc);
  if (adx < config.minAdxTrending) return { signal: null, rejectionReason: 'adx' };

  const atrPct14 = calculateAtrPct(primaryOhlc.highs, primaryOhlc.lows, primaryOhlc.closes, 14);
  const atrPct50 = calculateAtrPct(primaryOhlc.highs, primaryOhlc.lows, primaryOhlc.closes, 50);
  const regime = classifyRegime(adx, atrPct14, atrPct50);
  const minScore = regimeAdjustedMinScore(regime, config);
  const maxBosAgeCandles = regimeAdjustedMaxBosAge(regime, config);

  // Get most recent BOS/CHoCH
  const lastBreak = structureBreaks[structureBreaks.length - 1];
  // Only consider recent breaks. Older structure breaks are treated as stale because
  // the market has had too much time to absorb the displacement and invalidate the setup.
  if (lastBreak.index < primarySmc.candleCount - maxBosAgeCandles) {
    return { signal: null, rejectionReason: 'stale_bos' };
  }

  const direction: TradeDirection = lastBreak.direction === 1 ? 'LONG' : 'SHORT';

  // ── E&C Filter ──────────────────────────────────────────────────────────
  const ecLookback = 3;
  const recentEC = ec.filter(
    (e) => e.index >= primarySmc.candleCount - ecLookback - 1,
  );
  for (const sig of recentEC) {
    if (sig.type === 1 && direction === 'LONG') return { signal: null, rejectionReason: 'ec_veto' };
    if (sig.type === -1 && direction === 'SHORT') return { signal: null, rejectionReason: 'ec_veto' };
  }

  // ── Confluence Scoring ──────────────────────────────────────────────────
  const confluence = {
    bos: lastBreak.type === 'BOS',
    choch: lastBreak.type === 'CHoCH',
    fvgRetest: false,
    obRetest: false,
    swingAlignment: false,
    fvgStacking: false,
    mtfAgreement: false,
  };

  let score = 0;

  // Primary: BOS (30pts) or CHoCH (25pts)
  if (confluence.bos) score += 30;
  if (confluence.choch) score += 25;

  // FVG retest: price is within an unmitigated FVG in the trade direction
  const activeFvgs = fvgs.filter(
    (f) => f.mitigatedIndex === -1 && f.direction === lastBreak.direction,
  );
  let bestFvg: (typeof activeFvgs)[0] | null = null;
  for (const fvg of activeFvgs) {
    if (price >= fvg.bottom && price <= fvg.top) {
      confluence.fvgRetest = true;
      bestFvg = fvg;
      score += 20;
      break;
    }
    // Near FVG (within 0.5% of either edge)
    const proximity = Math.abs(price - (fvg.top + fvg.bottom) / 2) / price;
    if (proximity < 0.005) {
      confluence.fvgRetest = true;
      bestFvg = fvg;
      score += 15;
      break;
    }
  }

  // OB retest: price is within or near an unmitigated OB in trade direction
  const activeOBs = obs.filter(
    (o) => !o.mitigated && o.direction === lastBreak.direction,
  );
  let bestOB: (typeof activeOBs)[0] | null = null;
  for (const ob of activeOBs) {
    if (price >= ob.bottom && price <= ob.top) {
      confluence.obRetest = true;
      bestOB = ob;
      score += 15;
      break;
    }
    const proximity = Math.abs(price - (ob.top + ob.bottom) / 2) / price;
    if (proximity < 0.008) {
      confluence.obRetest = true;
      bestOB = ob;
      score += 10;
      break;
    }
  }

  // Swing structure alignment: check last 4 swings form HH+HL or LH+LL
  if (swings.indices.length >= 4) {
    const len = swings.levels.length;
    const startIdx = Math.max(0, len - 6);
    if (direction === 'LONG') {
      const lows: number[] = [];
      for (let i = startIdx; i < len; i++) {
        if (swings.directions[i] === -1) lows.push(swings.levels[i]);
      }
      if (lows.length >= 2 && lows[lows.length - 1] > lows[lows.length - 2]) {
        confluence.swingAlignment = true;
        score += 10;
      }
    } else {
      const highs: number[] = [];
      for (let i = startIdx; i < len; i++) {
        if (swings.directions[i] === 1) highs.push(swings.levels[i]);
      }
      if (highs.length >= 2 && highs[highs.length - 1] < highs[highs.length - 2]) {
        confluence.swingAlignment = true;
        score += 10;
      }
    }
  }

  // FVG stacking: 2+ unmitigated FVGs in same direction in last 20 candles
  const recentFvgs = activeFvgs.filter(
    (f) => f.index >= primarySmc.candleCount - 20,
  );
  if (recentFvgs.length >= 2) {
    confluence.fvgStacking = true;
    score += 10;
  }

  // Multi-timeframe agreement: 1H BOS matches 4H direction
  const recent1hBreaks = higherTfSmc.structureBreaks.filter(
    (b) => b.index >= higherTfSmc.candleCount - 5,
  );
  if (recent1hBreaks.some((b) => b.direction === lastBreak.direction)) {
    confluence.mtfAgreement = true;
    score += 10;
  }

  // ── Entry threshold: need primary + at least 2 confirmations ────────────
  console.log(`[paper-trading] ${primarySmc.asset} score=${score} (BOS:${lastBreak.type} FVG:${confluence.fvgRetest} OB:${confluence.obRetest} Swing:${confluence.swingAlignment} MTF:${confluence.mtfAgreement}) adx=${adx.toFixed(1)} regime:${regime} dir:${direction} bosAge:${primarySmc.candleCount - lastBreak.index}`);
  if (score < minScore) return { signal: null, rejectionReason: 'score' };

  // ── Determine entry type and optimal price ──────────────────────────────
  // If price is inside a zone, use market entry.
  // If price is near a zone but not inside, use limit at zone edge.
  let entryType: 'market' | 'limit' = 'market';
  let limitPrice = price;

  if (direction === 'LONG') {
    // For longs, optimal entry is at the bottom of the zone (best price)
    if (bestOB && price > bestOB.top) {
      // Price above OB — place limit at OB top (wait for pullback)
      entryType = 'limit';
      limitPrice = bestOB.top;
    } else if (bestFvg && price > bestFvg.top) {
      entryType = 'limit';
      limitPrice = bestFvg.top;
    }
  } else {
    // For shorts, optimal entry is at the top of the zone
    if (bestOB && price < bestOB.bottom) {
      entryType = 'limit';
      limitPrice = bestOB.bottom;
    } else if (bestFvg && price < bestFvg.bottom) {
      entryType = 'limit';
      limitPrice = bestFvg.bottom;
    }
  }

  // ── Calculate SL ────────────────────────────────────────────────────────
  const effectiveEntry = entryType === 'limit' ? limitPrice : price;
  const slPrice = calculateStopLoss(primarySmc, direction, effectiveEntry, config);
  if (slPrice === null) { console.log(`[paper-trading] ${primarySmc.asset} REJECTED: no SL level`); return { signal: null, rejectionReason: 'no_sl_level' }; }

  const slPct = Math.abs(effectiveEntry - slPrice) / effectiveEntry * 100;
  if (slPct < config.minSlPct || slPct > config.maxSlPct) {
    console.log(`[paper-trading] ${primarySmc.asset} REJECTED: SL% ${slPct.toFixed(2)} out of bounds [${config.minSlPct},${config.maxSlPct}]`);
    return { signal: null, rejectionReason: 'sl_bounds' };
  }

  // ── Calculate TP ────────────────────────────────────────────────────────
  const { tp1, tp2 } = calculateTakeProfit(primarySmc, direction, effectiveEntry, slPrice, config, regime, adx);

  const tp1Dist = Math.abs(tp1 - effectiveEntry);
  const slDist = Math.abs(effectiveEntry - slPrice);
  const rrRatio = tp1Dist / slDist;

  if (rrRatio < config.minRR) {
    console.log(`[paper-trading] ${primarySmc.asset} REJECTED: RR ${rrRatio.toFixed(2)} < ${config.minRR} (entry:${effectiveEntry.toFixed(2)} SL:${slPrice.toFixed(2)} TP1:${tp1.toFixed(2)})`);
    return { signal: null, rejectionReason: 'rr' };
  }

  const strongTrend = regime === 'TRENDING' && adx >= config.strongTrendAdx;
  const maxHoldHours = strongTrend
    ? Math.round(config.maxHoldHours * 1.5)
    : regime === 'VOLATILE'
      ? Math.max(24, Math.round(config.maxHoldHours * 0.66))
      : config.maxHoldHours;

  return {
    signal: {
      asset: primarySmc.asset,
      direction,
      entryPrice: price,
      limitPrice,
      slPrice,
      tp1Price: tp1,
      tp2Price: tp2,
      slPct,
      rrRatio: Math.round(rrRatio * 100) / 100,
      score,
      entryType,
      confluence,
      regime,
      adx: Math.round(adx * 10) / 10,
      maxHoldHours,
      smcContext: {
        lastBreak: {
          index: lastBreak.index,
          type: lastBreak.type,
          direction: lastBreak.direction,
          level: lastBreak.level,
        },
        activeFvgs: activeFvgs.length,
        activeOBs: activeOBs.length,
        adx: Math.round(adx * 10) / 10,
        regime,
        atrPct14,
        atrPct50,
        maxHoldHours,
        recentEC: recentEC.map((e) => ({ type: e.type, zScore: e.zScore })),
        entryType,
        limitPrice: entryType === 'limit' ? limitPrice : undefined,
        partialTakePct: strongTrend ? 0.4 : 0.5,
        scoreThreshold: minScore,
        maxBosAgeCandles,
      },
    },
  };
}

export function evaluateEntrySignal(
  primarySmc: SmcAnalysis,
  higherTfSmc: SmcAnalysis,
  primaryOhlc: OhlcArrays,
  config: PaperTradingConfig,
): SmcEntrySignal | null {
  return evaluateEntryDecision(primarySmc, higherTfSmc, primaryOhlc, config).signal;
}

// ── Stop Loss Calculation ────────────────────────────────────────────────────

function calculateStopLoss(
  smc: SmcAnalysis,
  direction: TradeDirection,
  entryPrice: number,
  config: PaperTradingConfig,
): number | null {
  const { orderBlocks: obs, swings } = smc;
  const buffer = 0.001; // 0.1% buffer beyond SL level

  if (direction === 'LONG') {
    // Hierarchy: OB bottom → swing low → fixed %
    const demandOBs = obs
      .filter((o) => !o.mitigated && o.direction === 1 && o.bottom < entryPrice)
      .sort((a, b) => b.bottom - a.bottom); // closest first

    if (demandOBs.length > 0) {
      return demandOBs[0].bottom * (1 - buffer);
    }

    // Most recent swing low below price
    const swingLows: number[] = [];
    for (let i = 0; i < swings.indices.length; i++) {
      if (swings.directions[i] === -1 && swings.levels[i] < entryPrice) {
        swingLows.push(swings.levels[i]);
      }
    }
    if (swingLows.length > 0) {
      return swingLows[swingLows.length - 1] * (1 - buffer);
    }

    return entryPrice * (1 - config.maxSlPct / 100);
  } else {
    const supplyOBs = obs
      .filter((o) => !o.mitigated && o.direction === -1 && o.top > entryPrice)
      .sort((a, b) => a.top - b.top);

    if (supplyOBs.length > 0) {
      return supplyOBs[0].top * (1 + buffer);
    }

    const swingHighs: number[] = [];
    for (let i = 0; i < swings.indices.length; i++) {
      if (swings.directions[i] === 1 && swings.levels[i] > entryPrice) {
        swingHighs.push(swings.levels[i]);
      }
    }
    if (swingHighs.length > 0) {
      return swingHighs[swingHighs.length - 1] * (1 + buffer);
    }

    return entryPrice * (1 + config.maxSlPct / 100);
  }
}

// ── Take Profit Calculation ──────────────────────────────────────────────────

function calculateTakeProfit(
  smc: SmcAnalysis,
  direction: TradeDirection,
  entryPrice: number,
  slPrice: number,
  config: PaperTradingConfig,
  regime: 'TRENDING' | 'RANGING' | 'VOLATILE',
  adx: number,
): { tp1: number; tp2: number } {
  const slDist = Math.abs(entryPrice - slPrice);
  const { orderBlocks: obs, swings } = smc;
  const strongTrend = regime === 'TRENDING' && adx >= config.strongTrendAdx;
  const tp2Multiple = strongTrend ? 4 : regime === 'VOLATILE' ? 2.5 : 3;

  if (direction === 'LONG') {
    const supplyOBs = obs
      .filter((o) => !o.mitigated && o.direction === -1 && o.bottom > entryPrice)
      .sort((a, b) => a.bottom - b.bottom);

    const swingHighs = swings.levels
      .filter((l, i) => swings.directions[i] === 1 && l > entryPrice)
      .sort((a, b) => a - b);

    let tp1 = entryPrice + slDist * config.minRR;
    if (supplyOBs.length > 0 && supplyOBs[0].bottom > tp1) {
      tp1 = supplyOBs[0].bottom;
    } else if (swingHighs.length > 0 && swingHighs[0] > tp1) {
      tp1 = swingHighs[0];
    }

    let tp2 = entryPrice + slDist * tp2Multiple;
    if (swingHighs.length > 1) tp2 = Math.max(tp2, swingHighs[1]);
    if (supplyOBs.length > 1) tp2 = Math.max(tp2, supplyOBs[1].bottom);

    return { tp1, tp2 };
  } else {
    const demandOBs = obs
      .filter((o) => !o.mitigated && o.direction === 1 && o.top < entryPrice)
      .sort((a, b) => b.top - a.top);

    const swingLows = swings.levels
      .filter((l, i) => swings.directions[i] === -1 && l < entryPrice)
      .sort((a, b) => b - a);

    let tp1 = entryPrice - slDist * config.minRR;
    if (demandOBs.length > 0 && demandOBs[0].top < tp1) tp1 = demandOBs[0].top;
    else if (swingLows.length > 0 && swingLows[0] < tp1) tp1 = swingLows[0];

    let tp2 = entryPrice - slDist * tp2Multiple;
    if (swingLows.length > 1) tp2 = Math.min(tp2, swingLows[1]);
    if (demandOBs.length > 1) tp2 = Math.min(tp2, demandOBs[1].top);

    return { tp1, tp2 };
  }
}

// ── Position Exit Check ──────────────────────────────────────────────────────

export function checkStructureInvalidation(
  position: PaperPosition,
  smc: SmcAnalysis,
): 'STRUCTURE_INVALIDATED' | 'EC_FORCE_CLOSE' | null {
  const { structureBreaks, euphoriaCapitulation: ec } = smc;
  const entryBreakIndex = Number(
    (position.smcContext.lastBreak as { index?: number } | undefined)?.index ?? -1,
  );

  // A newer opposing structure break invalidates the trade thesis.
  // Prefer post-entry breaks; otherwise fall back to the most recent structure window.
  const recentBreaks = structureBreaks.filter((b) => (
    entryBreakIndex >= 0
      ? b.index > entryBreakIndex
      : b.index >= smc.candleCount - 5
  ));
  for (const brk of recentBreaks) {
    if (position.direction === 'LONG' && brk.direction === -1) return 'STRUCTURE_INVALIDATED';
    if (position.direction === 'SHORT' && brk.direction === 1) return 'STRUCTURE_INVALIDATED';
  }

  // Strong E&C signal (zScore > 3) forces close
  const strongEC = ec.filter(
    (e) => e.index >= smc.candleCount - 2 && e.zScore > 3.0,
  );
  for (const sig of strongEC) {
    if (sig.type === 1 && position.direction === 'LONG') return 'EC_FORCE_CLOSE';
    if (sig.type === -1 && position.direction === 'SHORT') return 'EC_FORCE_CLOSE';
  }

  return null;
}

/**
 * Calculate trailing SL using both confirmed swings AND recent candle lows/highs.
 * This is more responsive than waiting for full swing confirmation.
 */
export function calculateTrailingStop(
  position: PaperPosition,
  smc: SmcAnalysis,
  ohlc: OhlcArrays | null,
): number {
  const { swings } = smc;
  let bestSl = position.slPrice;
  const atrPct = ohlc ? calculateAtrPct(ohlc.highs, ohlc.lows, ohlc.closes, 14) : 0;
  const dynamicBuffer = Math.max(0.0015, (atrPct / 100) * 0.35);

  if (position.direction === 'LONG') {
    // Trail behind confirmed swing lows
    for (let i = 0; i < swings.indices.length; i++) {
      if (swings.directions[i] === -1) {
        const level = swings.levels[i] * (1 - dynamicBuffer);
        if (level > bestSl && level < smc.currentPrice) bestSl = level;
      }
    }

    // Also consider the lowest low of the last 3 candles as a faster trail
    if (ohlc && ohlc.lows.length >= 3) {
      const recentLow = Math.min(
        ohlc.lows[ohlc.lows.length - 1],
        ohlc.lows[ohlc.lows.length - 2],
        ohlc.lows[ohlc.lows.length - 3],
      );
      const fastTrail = recentLow * (1 - dynamicBuffer);
      if (fastTrail > bestSl && fastTrail < smc.currentPrice) {
        bestSl = fastTrail;
      }
    }
  } else {
    for (let i = 0; i < swings.indices.length; i++) {
      if (swings.directions[i] === 1) {
        const level = swings.levels[i] * (1 + dynamicBuffer);
        if (level < bestSl && level > smc.currentPrice) bestSl = level;
      }
    }

    if (ohlc && ohlc.highs.length >= 3) {
      const recentHigh = Math.max(
        ohlc.highs[ohlc.highs.length - 1],
        ohlc.highs[ohlc.highs.length - 2],
        ohlc.highs[ohlc.highs.length - 3],
      );
      const fastTrail = recentHigh * (1 + dynamicBuffer);
      if (fastTrail < bestSl && fastTrail > smc.currentPrice) {
        bestSl = fastTrail;
      }
    }
  }

  return bestSl;
}
