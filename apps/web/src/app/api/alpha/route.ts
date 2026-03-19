import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h: number;
  market_cap_rank: number;
}

interface AlphaItem {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  change24h: number;
  volume: number;
  marketCap: number;
  rank: number;
  volumeToMcap?: number;
}

interface AlphaCache {
  gainers: AlphaItem[];
  losers: AlphaItem[];
  volumeSurge: AlphaItem[];
  asOf: string;
  timestamp: number;
}

let cache: AlphaCache | null = null;
const CACHE_TTL = 60_000;

const STABLE_SYMBOLS = new Set(['usdt','usdc','dai','busd','tusd','usdp','usdd','frax','lusd','gusd','susd','eurs','usdn','usdj','fei','frax','mim','dola']);

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL) {
    return NextResponse.json(cache, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  }

  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=24h',
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const coins: CoinMarket[] = await res.json();

    const eligible = coins.filter(
      (c) =>
        !STABLE_SYMBOLS.has(c.symbol.toLowerCase()) &&
        c.price_change_percentage_24h != null &&
        c.market_cap > 5_000_000 && // min $5M mcap to filter micro-cap noise
        c.current_price > 0
    );

    const sorted = [...eligible].sort(
      (a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h
    );

    const toItem = (c: CoinMarket): AlphaItem => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      image: c.image,
      price: c.current_price,
      change24h: c.price_change_percentage_24h,
      volume: c.total_volume,
      marketCap: c.market_cap,
      rank: c.market_cap_rank,
      volumeToMcap: c.market_cap > 0 ? c.total_volume / c.market_cap : 0,
    });

    const gainers = sorted.slice(0, 7).map(toItem);
    const losers = sorted.slice(-7).reverse().map(toItem);

    // Volume surge: high volume/mcap ratio = unusual capital flow
    const volumeSurge = [...eligible]
      .filter((c) => c.market_cap > 20_000_000) // min $20M mcap for volume surge
      .sort((a, b) => b.total_volume / b.market_cap - a.total_volume / a.market_cap)
      .slice(0, 7)
      .map(toItem);

    cache = { gainers, losers, volumeSurge, asOf: new Date().toISOString(), timestamp: now };

    return NextResponse.json(cache, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error) {
    console.error('Alpha route error:', error);
    if (cache) return NextResponse.json(cache); // return stale on error
    return NextResponse.json({ gainers: [], losers: [], volumeSurge: [], asOf: null }, { status: 500 });
  }
}
