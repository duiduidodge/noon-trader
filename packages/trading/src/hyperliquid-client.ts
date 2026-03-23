/**
 * Hyperliquid on-chain data client
 * Single POST call per scan returns all asset contexts — no auth required.
 * Enable with ENABLE_HYPERLIQUID=true env var.
 */

const HL_API = 'https://api.hyperliquid.xyz/info';
const REQUEST_TIMEOUT_MS = 10_000;

function getMarketDataBaseUrl(): string | null {
  const value = process.env.MARKET_DATA_URL?.trim();
  return value ? value.replace(/\/+$/, '') : null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface HLAssetContext {
  coin: string;
  funding: number;    // current hourly funding rate (e.g. 0.0001 = 0.01%)
  openInterest: number; // open interest in USD
  dayVolume: number;  // 24h notional volume in USD
  markPx: number;
}

interface HLMeta {
  universe: Array<{ name: string; szDecimals: number }>;
}

type HLRawCtx = {
  funding: string;
  openInterest: string;
  dayNtlVlm: string;
  markPx: string;
};

export type HLAssetMap = Map<string, HLAssetContext>;

export interface HLCandleSnapshot {
  t: number;
  T: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
}

export async function fetchHLAssetMap(): Promise<HLAssetMap | null> {
  try {
    const map: HLAssetMap = new Map();

    const marketDataBaseUrl = getMarketDataBaseUrl();
    if (marketDataBaseUrl) {
      const contexts = await fetchJson<{
        items: Array<{
          symbol: string;
          markPrice: number;
          fundingRate: number;
          openInterestUsd: number;
          dayVolumeUsd: number;
        }>;
      }>(`${marketDataBaseUrl}/contexts`);
      for (const item of contexts.items) {
        map.set(item.symbol, {
          coin: item.symbol,
          funding: Number(item.fundingRate) || 0,
          openInterest: Number(item.openInterestUsd) || 0,
          dayVolume: Number(item.dayVolumeUsd) || 0,
          markPx: Number(item.markPrice) || 0,
        });
      }
      return map;
    }

    const data = await fetchJson<[HLMeta, HLRawCtx[]]>(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    if (!Array.isArray(data) || data.length < 2) return null;

    const [meta, ctxs] = data;
    if (!meta?.universe || !Array.isArray(ctxs)) return null;
    for (let i = 0; i < meta.universe.length; i++) {
      const coin = meta.universe[i]?.name;
      const ctx = ctxs[i];
      if (!coin || !ctx) continue;
      map.set(coin, {
        coin,
        funding: parseFloat(ctx.funding) || 0,
        openInterest: parseFloat(ctx.openInterest) || 0,
        dayVolume: parseFloat(ctx.dayNtlVlm) || 0,
        markPx: parseFloat(ctx.markPx) || 0,
      });
    }
    return map;
  } catch {
    return null;
  }
}

function timeframeToHours(interval: string, limit: number): number {
  switch (interval) {
    case '1h':
      return limit;
    case '4h':
      return limit * 4;
    default:
      return limit;
  }
}

export async function fetchHLCandles(
  coin: string,
  interval: '1h' | '4h',
  limit: number,
): Promise<HLCandleSnapshot[] | null> {
  try {
    const marketDataBaseUrl = getMarketDataBaseUrl();
    if (marketDataBaseUrl) {
      const data = await fetchJson<{
        candles: {
          openTimes: number[];
          closeTimes: number[];
          opens: number[];
          highs: number[];
          lows: number[];
          closes: number[];
          volumes: number[];
        };
      }>(
        `${marketDataBaseUrl}/candles?symbol=${encodeURIComponent(coin)}&timeframe=${encodeURIComponent(interval)}&limit=${limit}`,
      );
      const candles = data.candles?.opens?.map((open, idx) => ({
        t: data.candles.openTimes[idx] ?? 0,
        T: data.candles.closeTimes[idx] ?? 0,
        o: String(open),
        h: String(data.candles.highs[idx] ?? 0),
        l: String(data.candles.lows[idx] ?? 0),
        c: String(data.candles.closes[idx] ?? 0),
        v: String(data.candles.volumes[idx] ?? 0),
      }));
      return candles?.length ? candles : null;
    }

    const endTime = Date.now();
    const lookbackHours = timeframeToHours(interval, limit) + 8;
    const startTime = endTime - (lookbackHours * 60 * 60 * 1000);
    const data = await fetchJson<HLCandleSnapshot[]>(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: {
          coin,
          interval,
          startTime,
          endTime,
        },
      }),
    });
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.slice(-limit);
  } catch {
    return null;
  }
}
