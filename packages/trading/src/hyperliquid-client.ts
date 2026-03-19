/**
 * Hyperliquid on-chain data client
 * Single POST call per scan returns all asset contexts — no auth required.
 * Enable with ENABLE_HYPERLIQUID=true env var.
 */

const HL_API = 'https://api.hyperliquid.xyz/info';
const REQUEST_TIMEOUT_MS = 10_000;

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

export async function fetchHLAssetMap(): Promise<HLAssetMap | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(HL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = (await res.json()) as [HLMeta, HLRawCtx[]];
    if (!Array.isArray(data) || data.length < 2) return null;

    const [meta, ctxs] = data;
    if (!meta?.universe || !Array.isArray(ctxs)) return null;

    const map: HLAssetMap = new Map();
    for (let i = 0; i < meta.universe.length; i++) {
      const coin = meta.universe[i]?.name;
      const ctx = ctxs[i];
      if (!coin || !ctx) continue;
      map.set(coin, {
        coin,
        funding:      parseFloat(ctx.funding)     || 0,
        openInterest: parseFloat(ctx.openInterest) || 0,
        dayVolume:    parseFloat(ctx.dayNtlVlm)    || 0,
        markPx:       parseFloat(ctx.markPx)       || 0,
      });
    }
    return map;
  } catch {
    return null;
  }
}
