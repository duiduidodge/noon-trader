/**
 * Downloads historical Binance Futures klines to disk for backtesting.
 * Caches as JSON files in apps/backtest/data/.
 * Usage: import and call fetchSymbolData() from run.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = 'https://fapi.binance.com';
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const REQUEST_TIMEOUT_MS = 15_000;
const KLINE_LIMIT = 1500; // Binance max per request

export interface Kline {
  time: number;   // open timestamp (ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchKlinesBatch(
  symbol: string, interval: string, startTime: number, endTime: number
): Promise<Kline[]> {
  const url = `${BASE_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=${KLINE_LIMIT}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as unknown[][];
      return data.map(k => ({
        time:   Number(k[0]),
        open:   parseFloat(k[1] as string),
        high:   parseFloat(k[2] as string),
        low:    parseFloat(k[3] as string),
        close:  parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
      }));
    } catch {
      if (attempt < 2) await sleep(500 * (attempt + 1));
    }
  }
  return [];
}

export async function fetchSymbolData(
  symbol: string,
  interval: string,
  startDate: string,
  endDate: string,
  forceRefresh = false,
): Promise<Kline[]> {
  const cacheFile = path.join(DATA_DIR, `${symbol}_${interval}_${startDate}_${endDate}.json`);
  if (!forceRefresh && fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as Kline[];
  }

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const allKlines: Kline[] = [];
  let cursor = startMs;

  console.log(`Fetching ${symbol} ${interval} from ${startDate}...`);
  while (cursor < endMs) {
    const batch = await fetchKlinesBatch(symbol, interval, cursor, endMs);
    if (batch.length === 0) break;
    allKlines.push(...batch);
    cursor = batch[batch.length - 1].time + 1;
    await sleep(100); // rate limit protection
    process.stdout.write(`  ${allKlines.length} candles...\r`);
    if (batch.length < KLINE_LIMIT) break;
  }
  console.log(`  ${allKlines.length} candles total.`);

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(allKlines));
  return allKlines;
}

export async function fetchAllSymbols(
  symbols: string[],
  intervals: string[],
  startDate: string,
  endDate: string,
  forceRefresh = false,
): Promise<Map<string, Map<string, Kline[]>>> {
  const result = new Map<string, Map<string, Kline[]>>();
  for (const symbol of symbols) {
    const intervalMap = new Map<string, Kline[]>();
    for (const interval of intervals) {
      intervalMap.set(interval, await fetchSymbolData(symbol, interval, startDate, endDate, forceRefresh));
    }
    result.set(symbol, intervalMap);
  }
  return result;
}

// Top perpetual futures by approximate market cap (as of 2025)
export const DEFAULT_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
  'MATICUSDT', 'LTCUSDT', 'UNIUSDT', 'ATOMUSDT', 'NEARUSDT',
  'AAVEUSDT', 'SUIUSDT', 'APTUSDT', 'INJUSDT', 'TIAUSDT',
];
