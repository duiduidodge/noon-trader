/**
 * Smart Money Concepts (SMC) — pure TypeScript port
 *
 * Provides swing detection, fair value gaps, order blocks,
 * and break-of-structure / change-of-character analysis
 * over simple OHLCV arrays (no external deps).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OhlcArrays {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  vols: number[];
}

export interface SwingResult {
  /** Bar indices where swings occur */
  indices: number[];
  /** 1 = swing high, -1 = swing low */
  directions: number[];
  /** Price level of each swing (high for SH, low for SL) */
  levels: number[];
}

export interface FairValueGap {
  /** Bar index of the middle candle that created the gap */
  index: number;
  /** 1 = bullish FVG, -1 = bearish FVG */
  direction: 1 | -1;
  top: number;
  bottom: number;
  /** Index of the first candle that mitigated the gap, or -1 */
  mitigatedIndex: number;
}

export interface OrderBlock {
  /** Bar index of the OB candle */
  index: number;
  /** 1 = bullish OB (demand), -1 = bearish OB (supply) */
  direction: 1 | -1;
  top: number;
  bottom: number;
  mitigated: boolean;
}

export interface StructureBreak {
  /** Bar index where the break was confirmed */
  index: number;
  type: 'BOS' | 'CHoCH';
  /** 1 = bullish, -1 = bearish */
  direction: 1 | -1;
  /** Price level that was broken */
  level: number;
}

export interface EuphoriaCapitulation {
  index: number;
  /** 1 = euphoria (potential top), -1 = capitulation (potential bottom) */
  type: 1 | -1;
  price: number;
  zScore: number;
}

// ---------------------------------------------------------------------------
// 1. Swing Highs & Lows
// ---------------------------------------------------------------------------

export function swingHighsLows(
  ohlc: OhlcArrays,
  swingLength = 5,
): SwingResult {
  const { highs, lows } = ohlc;
  const len = highs.length;

  // Double the length and centre the window (matches Python impl)
  const window = swingLength * 2;
  const half = Math.floor(window / 2);

  // Raw detection — a candle is a swing high / low if it equals the
  // rolling max / min of a centred window of size `window`.
  const rawIndices: number[] = [];
  const rawDirs: number[] = [];
  const rawLevels: number[] = [];

  for (let i = half; i < len - half; i++) {
    let maxH = -Infinity;
    let minL = Infinity;
    for (let j = i - half; j <= i + half; j++) {
      if (highs[j] > maxH) maxH = highs[j];
      if (lows[j] < minL) minL = lows[j];
    }

    const isSH = highs[i] === maxH;
    const isSL = lows[i] === minL;

    // If both, prefer the one with the larger relative move (pick one)
    if (isSH && !isSL) {
      rawIndices.push(i);
      rawDirs.push(1);
      rawLevels.push(highs[i]);
    } else if (isSL && !isSH) {
      rawIndices.push(i);
      rawDirs.push(-1);
      rawLevels.push(lows[i]);
    } else if (isSH && isSL) {
      // Tie-break: compare distance from open to high vs low
      const distH = highs[i] - Math.min(ohlc.opens[i], ohlc.closes[i]);
      const distL = Math.max(ohlc.opens[i], ohlc.closes[i]) - lows[i];
      if (distH >= distL) {
        rawIndices.push(i);
        rawDirs.push(1);
        rawLevels.push(highs[i]);
      } else {
        rawIndices.push(i);
        rawDirs.push(-1);
        rawLevels.push(lows[i]);
      }
    }
  }

  // Remove consecutive same-direction swings:
  //   consecutive highs → keep the higher one
  //   consecutive lows  → keep the lower one
  const indices: number[] = [];
  const directions: number[] = [];
  const levels: number[] = [];

  for (let i = 0; i < rawIndices.length; i++) {
    if (indices.length === 0) {
      indices.push(rawIndices[i]);
      directions.push(rawDirs[i]);
      levels.push(rawLevels[i]);
      continue;
    }

    const lastDir = directions[directions.length - 1];
    const lastLevel = levels[levels.length - 1];

    if (rawDirs[i] === lastDir) {
      // Same direction — keep the more extreme one
      if (rawDirs[i] === 1 && rawLevels[i] > lastLevel) {
        indices[indices.length - 1] = rawIndices[i];
        levels[levels.length - 1] = rawLevels[i];
      } else if (rawDirs[i] === -1 && rawLevels[i] < lastLevel) {
        indices[indices.length - 1] = rawIndices[i];
        levels[levels.length - 1] = rawLevels[i];
      }
      // otherwise discard the new one
    } else {
      indices.push(rawIndices[i]);
      directions.push(rawDirs[i]);
      levels.push(rawLevels[i]);
    }
  }

  return { indices, directions, levels };
}

// ---------------------------------------------------------------------------
// 2. Fair Value Gaps
// ---------------------------------------------------------------------------

export function fairValueGaps(ohlc: OhlcArrays): FairValueGap[] {
  const { opens, highs, lows, closes } = ohlc;
  const len = highs.length;
  const gaps: FairValueGap[] = [];

  for (let i = 1; i < len - 1; i++) {
    const prevHigh = highs[i - 1];
    const nextLow = lows[i + 1];
    const prevLow = lows[i - 1];
    const nextHigh = highs[i + 1];
    const bullish = closes[i] > opens[i];
    const bearish = closes[i] < opens[i];

    if (bullish && prevHigh < nextLow) {
      // Bullish FVG — gap between prev high and next low
      const top = nextLow;
      const bottom = prevHigh;
      const mitIdx = findMitigation(highs, lows, i + 2, len, bottom, top, 1);
      gaps.push({ index: i, direction: 1, top, bottom, mitigatedIndex: mitIdx });
    } else if (bearish && prevLow > nextHigh) {
      // Bearish FVG — gap between next high and prev low
      const top = prevLow;
      const bottom = nextHigh;
      const mitIdx = findMitigation(highs, lows, i + 2, len, bottom, top, -1);
      gaps.push({ index: i, direction: -1, top, bottom, mitigatedIndex: mitIdx });
    }
  }

  return gaps;
}

/** Find the first candle at or after `start` that enters the gap */
function findMitigation(
  highs: number[],
  lows: number[],
  start: number,
  len: number,
  bottom: number,
  top: number,
  direction: 1 | -1,
): number {
  for (let j = start; j < len; j++) {
    if (direction === 1) {
      // Bullish FVG mitigated when price drops into the gap (low <= top)
      if (lows[j] <= top) return j;
    } else {
      // Bearish FVG mitigated when price rises into the gap (high >= bottom)
      if (highs[j] >= bottom) return j;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// 3. Order Blocks
// ---------------------------------------------------------------------------

export function orderBlocks(
  ohlc: OhlcArrays,
  swings: SwingResult,
): OrderBlock[] {
  const { highs, lows, closes } = ohlc;
  const len = closes.length;
  const blocks: OrderBlock[] = [];

  for (let s = 0; s < swings.indices.length; s++) {
    const swingIdx = swings.indices[s];
    const swingDir = swings.directions[s];
    const swingLevel = swings.levels[s];

    if (swingDir === 1) {
      // Swing high — look for bullish breakout (close above swing high)
      for (let b = swingIdx + 1; b < len; b++) {
        if (closes[b] > swingLevel) {
          // Find the candle with the lowest low between swing and breakout
          let obIdx = swingIdx;
          let obLow = lows[swingIdx];
          for (let k = swingIdx; k <= b; k++) {
            if (lows[k] < obLow) {
              obLow = lows[k];
              obIdx = k;
            }
          }
          // Check mitigation: price low breaks below OB bottom after breakout
          let mitigated = false;
          for (let m = b + 1; m < len; m++) {
            if (lows[m] < obLow) {
              mitigated = true;
              break;
            }
          }
          blocks.push({
            index: obIdx,
            direction: 1,
            top: highs[obIdx],
            bottom: obLow,
            mitigated,
          });
          break; // only first breakout per swing
        }
      }
    } else {
      // Swing low — look for bearish breakdown (close below swing low)
      for (let b = swingIdx + 1; b < len; b++) {
        if (closes[b] < swingLevel) {
          // Find the candle with the highest high between swing and breakdown
          let obIdx = swingIdx;
          let obHigh = highs[swingIdx];
          for (let k = swingIdx; k <= b; k++) {
            if (highs[k] > obHigh) {
              obHigh = highs[k];
              obIdx = k;
            }
          }
          // Check mitigation: price high breaks above OB top after breakdown
          let mitigated = false;
          for (let m = b + 1; m < len; m++) {
            if (highs[m] > obHigh) {
              mitigated = true;
              break;
            }
          }
          blocks.push({
            index: obIdx,
            direction: -1,
            top: obHigh,
            bottom: lows[obIdx],
            mitigated,
          });
          break;
        }
      }
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// 4. Break of Structure / Change of Character
// ---------------------------------------------------------------------------

export function breakOfStructure(
  ohlc: OhlcArrays,
  swings: SwingResult,
): StructureBreak[] {
  const breaks: StructureBreak[] = [];
  const { indices, directions, levels } = swings;

  // We need at least 4 swing points to evaluate a pattern
  for (let i = 3; i < indices.length; i++) {
    const d0 = directions[i - 3];
    const d1 = directions[i - 2];
    const d2 = directions[i - 1];
    const d3 = directions[i];

    const l0 = levels[i - 3];
    const l1 = levels[i - 2];
    const l2 = levels[i - 1];
    const l3 = levels[i];

    // Bullish patterns: [-1, 1, -1, 1]  (low, high, low, high)
    if (d0 === -1 && d1 === 1 && d2 === -1 && d3 === 1) {
      const higherLows = l2 > l0;
      const higherHighs = l3 > l1;

      if (higherLows && higherHighs) {
        // BOS: continuation — both lows and highs are higher
        breaks.push({
          index: indices[i],
          type: 'BOS',
          direction: 1,
          level: l1, // the previous high that was broken
        });
      } else if (higherHighs && !higherLows) {
        // CHoCH: new high but failed to hold higher low (reversal signal)
        breaks.push({
          index: indices[i],
          type: 'CHoCH',
          direction: 1,
          level: l1,
        });
      }
    }

    // Bearish patterns: [1, -1, 1, -1]  (high, low, high, low)
    if (d0 === 1 && d1 === -1 && d2 === 1 && d3 === -1) {
      const lowerHighs = l2 < l0;
      const lowerLows = l3 < l1;

      if (lowerHighs && lowerLows) {
        // BOS: continuation — both highs and lows are lower
        breaks.push({
          index: indices[i],
          type: 'BOS',
          direction: -1,
          level: l1, // the previous low that was broken
        });
      } else if (lowerLows && !lowerHighs) {
        // CHoCH: new low but failed to make lower high (reversal signal)
        breaks.push({
          index: indices[i],
          type: 'CHoCH',
          direction: -1,
          level: l1,
        });
      }
    }
  }

  return breaks;
}

// ---------------------------------------------------------------------------
// 5. Euphoria & Capitulation
// ---------------------------------------------------------------------------

export function euphoriaCapitulation(
  ohlc: OhlcArrays,
  lookback = 30,
  zThresh = 2.0,
  lowWindow = 20,
  highWindow = 20,
): EuphoriaCapitulation[] {
  const { highs, lows, vols } = ohlc;
  const len = highs.length;
  if (len < lookback + 1) return [];

  const signals: EuphoriaCapitulation[] = [];

  for (let i = lookback; i < len; i++) {
    let sum = 0;
    for (let j = i - lookback; j < i; j++) sum += vols[j];
    const mean = sum / lookback;

    let sqSum = 0;
    for (let j = i - lookback; j < i; j++) sqSum += (vols[j] - mean) ** 2;
    const std = Math.sqrt(sqSum / lookback);

    if (std === 0) continue;
    const zScore = (vols[i] - mean) / std;
    if (zScore <= zThresh) continue;

    const lowStart = Math.max(0, i - lowWindow + 1);
    let lowestLow = Infinity;
    for (let j = lowStart; j <= i; j++) {
      if (lows[j] < lowestLow) lowestLow = lows[j];
    }

    const highStart = Math.max(0, i - highWindow + 1);
    let highestHigh = -Infinity;
    for (let j = highStart; j <= i; j++) {
      if (highs[j] > highestHigh) highestHigh = highs[j];
    }

    if (lows[i] <= lowestLow) {
      signals.push({ index: i, type: -1, price: lows[i], zScore });
    }
    if (highs[i] >= highestHigh) {
      signals.push({ index: i, type: 1, price: highs[i], zScore });
    }
  }

  return signals;
}
