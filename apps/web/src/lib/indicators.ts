export type IndicatorConfig = {
  id: string;
  type: "sma" | "ema" | "vwap";
  period: number;
  color: string;
};

export type OHLCPoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type LinePoint = { time: number; value: number };

export function calcSMA(data: OHLCPoint[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    out.push({ time: data[i].time, value: sum / period });
  }
  return out;
}

export function calcEMA(data: OHLCPoint[], period: number): LinePoint[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const out: LinePoint[] = [];

  // Seed with SMA of first `period` bars
  let prev = 0;
  for (let i = 0; i < period; i++) prev += data[i].close;
  prev /= period;
  out.push({ time: data[period - 1].time, value: prev });

  for (let i = period; i < data.length; i++) {
    const ema = data[i].close * k + prev * (1 - k);
    out.push({ time: data[i].time, value: ema });
    prev = ema;
  }
  return out;
}

export function calcRSI(data: OHLCPoint[], period: number): LinePoint[] {
  if (data.length < period + 1) return [];
  const out: LinePoint[] = [];

  // Initial average gain/loss over first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = data[i].close - data[i - 1].close;
    if (delta > 0) avgGain += delta;
    else avgLoss += -delta;
  }
  avgGain /= period;
  avgLoss /= period;

  const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  out.push({ time: data[period].time, value: rsi0 });

  // Wilder smoothing for subsequent bars
  for (let i = period + 1; i < data.length; i++) {
    const delta = data[i].close - data[i - 1].close;
    const gain  = delta > 0 ? delta : 0;
    const loss  = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    out.push({ time: data[i].time, value: rsi });
  }
  return out;
}

/**
 * VWAP — Volume-Weighted Average Price
 * Resets each trading session. For crypto (24/7), uses a rolling anchor
 * based on the period parameter as number of bars to look back.
 */
export function calcVWAP(data: OHLCPoint[], period: number): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - period + 1);
    let cumTP = 0;
    let cumVol = 0;
    for (let j = start; j <= i; j++) {
      const tp = (data[j].high + data[j].low + data[j].close) / 3;
      cumTP += tp * data[j].volume;
      cumVol += data[j].volume;
    }
    if (cumVol > 0) {
      out.push({ time: data[i].time, value: cumTP / cumVol });
    }
  }
  return out;
}
