'use client';

import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { formatCompactNumber, formatPercent, formatPrice } from '@/lib/utils';
import { Globe, BarChart2, PieChart } from 'lucide-react';
import Image from 'next/image';

interface CoinPrice {
  id: string;
  rank: number;
  name: string;
  symbol: string;
  image: string | null;
  priceUsd: number;
  changePercent24Hr: number;
  marketCapUsd: number;
}

interface GlobalStats {
  totalMcap: number;
  totalVolume: number;
  btcDominance: number;
  avgChange24h: number;
}

interface PricesData {
  prices: CoinPrice[];
  global: GlobalStats;
}

// Stablecoins to exclude from the ticker
const STABLECOIN_IDS = new Set([
  'tether', 'usd-coin', 'dai', 'first-digital-usd',
  'binance-peg-busd', 'frax', 'true-usd', 'paxos-standard',
  'usdd', 'ethena-usde', 'paypal-usd',
]);
const STABLECOIN_SYMBOLS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'BUSD', 'FRAX', 'TUSD', 'USDP', 'USDD', 'USDE', 'PYUSD']);

interface MarketTickerProps {
  marquee?: boolean;
  compact?: boolean;
}

export function MarketTicker({ marquee = true, compact = false }: MarketTickerProps) {
  const { data } = useQuery({
    queryKey: ['prices'],
    queryFn: async () => {
      const res = await fetch('/api/prices');
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<PricesData>;
    },
    refetchInterval: 60_000,
  });

  if (!data) return null;

  // Get top 10 non-stablecoin tokens by market cap
  const top10 = data.prices
    .filter((c) => !STABLECOIN_IDS.has(c.id) && !STABLECOIN_SYMBOLS.has(c.symbol))
    .sort((a, b) => b.marketCapUsd - a.marketCapUsd)
    .slice(0, 10);

  const isPositive = data.global.avgChange24h >= 0;

  const tickerContent = (
    <div className={clsx('flex items-center whitespace-nowrap', compact ? 'gap-2 px-2' : 'gap-2 px-3 md:gap-3 md:px-4')}>
      {/* Global stats — grouped in a subtle card */}
      <div className="inline-flex items-center gap-2 md:gap-3 rounded-full bg-surface/50 border border-border/30 px-2.5 md:px-3 py-0.5">
        <span
          className={clsx(
            'font-mono-data text-[11px] font-bold',
            isPositive ? 'text-bullish' : 'text-bearish'
          )}
        >
          24h {formatPercent(data.global.avgChange24h)}
        </span>
        <span className="h-3 w-px bg-border/30" />
        <span className="inline-flex items-center gap-1 font-mono-data text-[11px]">
          <Globe className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
          <span className="font-semibold text-foreground">{formatCompactNumber(data.global.totalMcap)}</span>
        </span>
        <span className="h-3 w-px bg-border/30" />
        <span className="inline-flex items-center gap-1 font-mono-data text-[11px]">
          <BarChart2 className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
          <span className="font-semibold text-foreground">{formatCompactNumber(data.global.totalVolume)}</span>
        </span>
        <span className="h-3 w-px bg-border/30" />
        <span className="inline-flex items-center gap-1 font-mono-data text-[11px]">
          <PieChart className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
          <span className="text-muted-foreground/60">Dom</span>
          <span className="font-semibold text-foreground">{data.global.btcDominance.toFixed(1)}%</span>
        </span>
      </div>

      {/* Individual token cards */}
      {top10.map((coin) => {
        const coinPositive = coin.changePercent24Hr >= 0;
        return (
          <div
            key={coin.id}
            className={clsx(
              'inline-flex items-center gap-2 rounded-full border py-0.5 font-mono-data text-[11px] transition-colors',
              compact ? 'px-2.5' : 'px-3',
              'bg-surface/40 border-border/30'
            )}
          >
            {coin.image ? (
              <Image
                src={coin.image}
                alt={coin.symbol}
                width={16}
                height={16}
                className="h-4 w-4 rounded-full shrink-0"
              />
            ) : (
              <span className="h-4 w-4 rounded-full bg-muted/30 shrink-0 flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                {coin.symbol[0]}
              </span>
            )}
            <span className="font-bold text-foreground">{coin.symbol}</span>
            <span className="text-muted-foreground/80">{formatPrice(coin.priceUsd)}</span>
            <span className={clsx(
              'font-bold',
              coinPositive ? 'text-bullish' : 'text-bearish'
            )}>
              {formatPercent(coin.changePercent24Hr)}
            </span>
          </div>
        );
      })}
    </div>
  );

  if (!marquee) {
    return (
      <div className="overflow-x-auto no-scrollbar py-1">
        {tickerContent}
      </div>
    );
  }

  return (
    <div className="relative flex overflow-hidden py-1">
      <div className="animate-scroll-ticker flex shrink-0">
        {tickerContent}
        <div aria-hidden="true">
          {tickerContent}
        </div>
      </div>
    </div>
  );
}
