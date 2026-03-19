'use client';

import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { WidgetCard } from './widget-card';
import { formatPrice, formatPercent } from '@/lib/utils';

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

interface PricesResponse {
  prices: CoinPrice[];
  global: {
    totalMcap: number;
    totalVolume: number;
    btcDominance: number;
    avgChange24h: number;
  };
}

async function fetchPrices(): Promise<PricesResponse> {
  const res = await fetch('/api/prices');
  if (!res.ok) throw new Error('Failed to fetch prices');
  return res.json();
}

export function PricesWidget() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['prices'],
    queryFn: fetchPrices,
    refetchInterval: 60_000,
  });

  return (
    <WidgetCard
      title="Markets"
      headerRight={
        <span className="font-mono-data text-[9px] uppercase tracking-wider text-muted-foreground/50">
          Live
        </span>
      }
    >
      <div className="max-h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-accent/50" />
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center font-mono-data text-xs text-muted-foreground/50">
            Prices unavailable
          </div>
        ) : (
          <div>
            {data?.prices.map((coin) => (
              <div
                key={coin.id}
                className="group flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface/60"
              >
                <span className="w-5 text-right font-mono-data text-[10px] text-muted-foreground/40">
                  {coin.rank}
                </span>
                {coin.image && (
                  <img
                    src={coin.image}
                    alt={coin.name}
                    className="h-5 w-5 rounded-full"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground">
                      {coin.name}
                    </span>
                    <span className="font-mono-data text-[10px] text-muted-foreground/50 uppercase">
                      {coin.symbol}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono-data text-xs font-medium text-foreground">
                    {formatPrice(coin.priceUsd)}
                  </div>
                  <div
                    className={clsx(
                      'flex items-center justify-end gap-0.5 font-mono-data text-[10px] font-medium',
                      coin.changePercent24Hr >= 0
                        ? 'text-bullish'
                        : 'text-bearish'
                    )}
                  >
                    {coin.changePercent24Hr >= 0 ? (
                      <TrendingUp className="h-2.5 w-2.5" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5" />
                    )}
                    {formatPercent(coin.changePercent24Hr)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}
