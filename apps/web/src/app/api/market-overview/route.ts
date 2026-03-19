import { NextResponse } from 'next/server';

interface MarketOverviewData {
  totalMarketCap: number;
  totalVolume: number;
  btcDominance: number;
  marketCapChange24h: number;
  fearGreedIndex: number;
  fearGreedLabel: string;
  sparkline: number[];
}

interface CoinCapAsset {
  marketCapUsd?: string;
  volumeUsd24Hr?: string;
  changePercent24Hr?: string;
}

interface CoinCapAssetsResponse {
  data?: CoinCapAsset[];
}

interface OverviewCache {
  data: MarketOverviewData;
  timestamp: number;
}

let cache: OverviewCache | null = null;
const CACHE_TTL = 60_000;

async function fetchGlobalData() {
  const res = await fetch('https://api.coingecko.com/api/v3/global', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`CoinGecko global: ${res.status}`);
  const json = await res.json();
  return json.data;
}

async function fetchBtcSparkline(): Promise<number[]> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin&sparkline=true',
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error(`CoinGecko sparkline: ${res.status}`);
  const coins = await res.json();
  const prices: number[] = coins[0]?.sparkline_in_7d?.price || [];

  if (prices.length === 0) return [];

  // Downsample to 14 bars
  const step = Math.floor(prices.length / 14);
  return Array.from({ length: 14 }, (_, i) => {
    const idx = Math.min(i * step, prices.length - 1);
    return prices[idx];
  });
}

async function fetchFearGreed() {
  const res = await fetch('https://api.alternative.me/fng/?limit=1', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Fear & Greed: ${res.status}`);
  const json = await res.json();
  const entry = json.data?.[0];
  return {
    value: parseInt(entry?.value || '50'),
    label: entry?.value_classification || 'Neutral',
  };
}

// Fallback: derive global stats from CoinCap top-20 assets
async function fetchGlobalFromCoinCap() {
  const res = await fetch('https://api.coincap.io/v2/assets?limit=20', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`CoinCap: ${res.status}`);
  const json = (await res.json()) as CoinCapAssetsResponse;
  const assets = json.data ?? [];

  const totalMcap = assets.reduce((s, a) => s + parseFloat(a.marketCapUsd || '0'), 0);
  const totalVol = assets.reduce((s, a) => s + parseFloat(a.volumeUsd24Hr || '0'), 0);
  const btcCap = parseFloat(assets[0]?.marketCapUsd || '0');
  const avgChange = assets.reduce((s, a) => s + parseFloat(a.changePercent24Hr || '0'), 0) / assets.length;

  return {
    total_market_cap: { usd: totalMcap },
    total_volume: { usd: totalVol },
    market_cap_percentage: { btc: (btcCap / totalMcap) * 100 },
    market_cap_change_percentage_24h_usd: avgChange,
  };
}

export async function GET() {
  const now = Date.now();

  if (cache && now - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache.data, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  }

  try {
    // Fetch all three in parallel; sparkline and fear/greed are non-critical
    let globalData;
    try {
      globalData = await fetchGlobalData();
    } catch {
      globalData = await fetchGlobalFromCoinCap();
    }

    const [sparkline, fearGreed] = await Promise.all([
      fetchBtcSparkline().catch(() => []),
      fetchFearGreed().catch(() => ({ value: 50, label: 'Neutral' })),
    ]);

    const result: MarketOverviewData = {
      totalMarketCap: globalData.total_market_cap?.usd || 0,
      totalVolume: globalData.total_volume?.usd || 0,
      btcDominance: globalData.market_cap_percentage?.btc || 0,
      marketCapChange24h: globalData.market_cap_change_percentage_24h_usd || 0,
      fearGreedIndex: fearGreed.value,
      fearGreedLabel: fearGreed.label,
      sparkline,
    };

    cache = { data: result, timestamp: now };

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error) {
    if (cache) {
      return NextResponse.json(cache.data, {
        headers: { 'Cache-Control': 'public, s-maxage=30' },
      });
    }
    return NextResponse.json({ error: 'Failed to fetch market overview' }, { status: 502 });
  }
}
