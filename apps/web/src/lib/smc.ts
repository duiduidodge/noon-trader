/**
 * Smart Money Concepts — browser-side calculations
 * Adapted from the worker-side port of joshyattridge/smart-money-concepts
 */

import type { OHLCPoint } from "./indicators";

// ── Euphoria & Capitulation defaults ──────────────────────────────────────────

const EC_LOOKBACK = 30;     // z-score rolling window
const EC_Z_THRESH = 2.0;    // volume z-score threshold
const EC_LOW_WINDOW = 20;   // bars to check lowest low
const EC_HIGH_WINDOW = 20;  // bars to check highest high

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SwingPoint {
  /** Index into the OHLCPoint array */
  index: number;
  /** 1 = swing high, -1 = swing low */
  direction: 1 | -1;
  /** Price level */
  level: number;
  /** Unix timestamp (seconds) */
  time: number;
}

export interface FairValueGap {
  index: number;
  direction: 1 | -1;
  top: number;
  bottom: number;
  startTime: number;
  endTime: number;
  mitigated: boolean;
}

export interface OrderBlock {
  index: number;
  direction: 1 | -1;
  top: number;
  bottom: number;
  startTime: number;
  mitigated: boolean;
}

export interface StructureBreak {
  index: number;
  type: "BOS" | "CHoCH";
  direction: 1 | -1;
  level: number;
  time: number;
}

export interface EuphoriaCapitulation {
  index: number;
  /** 1 = euphoria (potential top), -1 = capitulation (potential bottom) */
  type: 1 | -1;
  price: number;
  zScore: number;
  time: number;
}

// ── Swing Highs & Lows ───────────────────────────────────────────────────────

export function calcSwingHighsLows(data: OHLCPoint[], swingLength = 5): SwingPoint[] {
  const len = data.length;
  const window = swingLength * 2;
  const half = Math.floor(window / 2);

  const raw: SwingPoint[] = [];

  for (let i = half; i < len - half; i++) {
    let maxH = -Infinity;
    let minL = Infinity;
    for (let j = i - half; j <= i + half; j++) {
      if (data[j].high > maxH) maxH = data[j].high;
      if (data[j].low < minL) minL = data[j].low;
    }

    const isSH = data[i].high === maxH;
    const isSL = data[i].low === minL;

    if (isSH && !isSL) {
      raw.push({ index: i, direction: 1, level: data[i].high, time: data[i].time });
    } else if (isSL && !isSH) {
      raw.push({ index: i, direction: -1, level: data[i].low, time: data[i].time });
    } else if (isSH && isSL) {
      const distH = data[i].high - Math.min(data[i].open, data[i].close);
      const distL = Math.max(data[i].open, data[i].close) - data[i].low;
      raw.push({
        index: i,
        direction: distH >= distL ? 1 : -1,
        level: distH >= distL ? data[i].high : data[i].low,
        time: data[i].time,
      });
    }
  }

  // Remove consecutive same-direction swings
  const result: SwingPoint[] = [];
  for (const sp of raw) {
    if (result.length === 0) {
      result.push(sp);
      continue;
    }
    const last = result[result.length - 1];
    if (sp.direction === last.direction) {
      if (sp.direction === 1 && sp.level > last.level) {
        result[result.length - 1] = sp;
      } else if (sp.direction === -1 && sp.level < last.level) {
        result[result.length - 1] = sp;
      }
    } else {
      result.push(sp);
    }
  }

  return result;
}

// ── Fair Value Gaps ──────────────────────────────────────────────────────────

export function calcFairValueGaps(data: OHLCPoint[]): FairValueGap[] {
  const len = data.length;
  const gaps: FairValueGap[] = [];

  for (let i = 1; i < len - 1; i++) {
    const prevHigh = data[i - 1].high;
    const nextLow = data[i + 1].low;
    const prevLow = data[i - 1].low;
    const nextHigh = data[i + 1].high;
    const bullish = data[i].close > data[i].open;
    const bearish = data[i].close < data[i].open;

    if (bullish && prevHigh < nextLow) {
      const top = nextLow;
      const bottom = prevHigh;
      // Check mitigation
      let mitigated = false;
      let endTime = data[len - 1].time;
      for (let j = i + 2; j < len; j++) {
        if (data[j].low <= top) {
          mitigated = true;
          endTime = data[j].time;
          break;
        }
      }
      gaps.push({
        index: i, direction: 1, top, bottom,
        startTime: data[i].time, endTime, mitigated,
      });
    } else if (bearish && prevLow > nextHigh) {
      const top = prevLow;
      const bottom = nextHigh;
      let mitigated = false;
      let endTime = data[len - 1].time;
      for (let j = i + 2; j < len; j++) {
        if (data[j].high >= bottom) {
          mitigated = true;
          endTime = data[j].time;
          break;
        }
      }
      gaps.push({
        index: i, direction: -1, top, bottom,
        startTime: data[i].time, endTime, mitigated,
      });
    }
  }

  return gaps;
}

// ── Order Blocks ─────────────────────────────────────────────────────────────

export function calcOrderBlocks(data: OHLCPoint[], swings: SwingPoint[]): OrderBlock[] {
  const len = data.length;
  const blocks: OrderBlock[] = [];

  for (const sw of swings) {
    if (sw.direction === 1) {
      // Swing high — look for bullish breakout
      for (let b = sw.index + 1; b < len; b++) {
        if (data[b].close > sw.level) {
          let obIdx = sw.index;
          let obLow = data[sw.index].low;
          for (let k = sw.index; k <= b; k++) {
            if (data[k].low < obLow) {
              obLow = data[k].low;
              obIdx = k;
            }
          }
          let mitigated = false;
          for (let m = b + 1; m < len; m++) {
            if (data[m].low < obLow) { mitigated = true; break; }
          }
          blocks.push({
            index: obIdx,
            direction: 1,
            top: data[obIdx].high,
            bottom: obLow,
            startTime: data[obIdx].time,
            mitigated,
          });
          break;
        }
      }
    } else {
      // Swing low — look for bearish breakdown
      for (let b = sw.index + 1; b < len; b++) {
        if (data[b].close < sw.level) {
          let obIdx = sw.index;
          let obHigh = data[sw.index].high;
          for (let k = sw.index; k <= b; k++) {
            if (data[k].high > obHigh) {
              obHigh = data[k].high;
              obIdx = k;
            }
          }
          let mitigated = false;
          for (let m = b + 1; m < len; m++) {
            if (data[m].high > obHigh) { mitigated = true; break; }
          }
          blocks.push({
            index: obIdx,
            direction: -1,
            top: obHigh,
            bottom: data[obIdx].low,
            startTime: data[obIdx].time,
            mitigated,
          });
          break;
        }
      }
    }
  }

  return blocks;
}

// ── Break of Structure / Change of Character ────────────────────────────────

export function calcBreakOfStructure(data: OHLCPoint[], swings: SwingPoint[]): StructureBreak[] {
  const breaks: StructureBreak[] = [];

  for (let i = 3; i < swings.length; i++) {
    const d0 = swings[i - 3].direction;
    const d1 = swings[i - 2].direction;
    const d2 = swings[i - 1].direction;
    const d3 = swings[i].direction;

    const l0 = swings[i - 3].level;
    const l1 = swings[i - 2].level;
    const l2 = swings[i - 1].level;
    const l3 = swings[i].level;

    // Bullish patterns: [-1, 1, -1, 1]
    if (d0 === -1 && d1 === 1 && d2 === -1 && d3 === 1) {
      if (l2 > l0 && l3 > l1) {
        breaks.push({ index: swings[i].index, type: "BOS", direction: 1, level: l1, time: swings[i].time });
      } else if (l3 > l1 && !(l2 > l0)) {
        breaks.push({ index: swings[i].index, type: "CHoCH", direction: 1, level: l1, time: swings[i].time });
      }
    }

    // Bearish patterns: [1, -1, 1, -1]
    if (d0 === 1 && d1 === -1 && d2 === 1 && d3 === -1) {
      if (l2 < l0 && l3 < l1) {
        breaks.push({ index: swings[i].index, type: "BOS", direction: -1, level: l1, time: swings[i].time });
      } else if (l3 < l1 && !(l2 < l0)) {
        breaks.push({ index: swings[i].index, type: "CHoCH", direction: -1, level: l1, time: swings[i].time });
      }
    }
  }

  return breaks;
}

// ── Euphoria & Capitulation ─────────────────────────────────────────────────

export function calcEuphoriaCapitulation(
  data: OHLCPoint[],
  lookback = EC_LOOKBACK,
  zThresh = EC_Z_THRESH,
  lowWindow = EC_LOW_WINDOW,
  highWindow = EC_HIGH_WINDOW,
): EuphoriaCapitulation[] {
  const len = data.length;
  if (len < lookback + 1) return [];

  const signals: EuphoriaCapitulation[] = [];

  for (let i = lookback; i < len; i++) {
    // Volume z-score: (vol - mean) / stddev over lookback period
    let sum = 0;
    for (let j = i - lookback; j < i; j++) sum += data[j].volume;
    const mean = sum / lookback;

    let sqSum = 0;
    for (let j = i - lookback; j < i; j++) sqSum += (data[j].volume - mean) ** 2;
    const std = Math.sqrt(sqSum / lookback);

    if (std === 0) continue;
    const zScore = (data[i].volume - mean) / std;
    if (zScore <= zThresh) continue;

    // Check lowest low in the window
    const lowStart = Math.max(0, i - lowWindow + 1);
    let lowestLow = Infinity;
    for (let j = lowStart; j <= i; j++) {
      if (data[j].low < lowestLow) lowestLow = data[j].low;
    }

    // Check highest high in the window
    const highStart = Math.max(0, i - highWindow + 1);
    let highestHigh = -Infinity;
    for (let j = highStart; j <= i; j++) {
      if (data[j].high > highestHigh) highestHigh = data[j].high;
    }

    // Capitulation: high volume + at/below recent lowest low
    if (data[i].low <= lowestLow) {
      signals.push({
        index: i,
        type: -1,
        price: data[i].low,
        zScore,
        time: data[i].time,
      });
    }

    // Euphoria: high volume + at/above recent highest high
    if (data[i].high >= highestHigh) {
      signals.push({
        index: i,
        type: 1,
        price: data[i].high,
        zScore,
        time: data[i].time,
      });
    }
  }

  return signals;
}
