'use client';

import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import Image from 'next/image';
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

export function PricesStrip() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['prices'],
    queryFn: fetchPrices,
    refetchInterval: 60_000,
  });

  return (
    <div className="glass rounded-lg overflow-hidden">
      {/* Accent top line */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      <div className="px-4 py-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold tracking-wide text-foreground uppercase">
            Markets
          </h2>
          <div className="text-right">
            <div className="font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground/65">
              Live
            </div>
            {dataUpdatedAt > 0 && (
              <div className="font-mono-data text-[10px] text-muted-foreground/45">
                {new Date(dataUpdatedAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-accent/50" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-bearish/30 bg-bearish/10 px-3 py-2 text-xs text-bearish">
            Live market prices are temporarily unavailable.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {data?.prices.slice(0, 12).map((coin) => (
              <CoinCard key={coin.id} coin={coin} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CoinCard({ coin }: { coin: CoinPrice }) {
  const isPositive = coin.changePercent24Hr >= 0;

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border/30 bg-surface/40 px-3 py-2.5 transition-colors duration-150 hover:bg-surface/70">
      {coin.image && (
        <Image
          src={coin.image}
          alt={coin.name}
          width={20}
          height={20}
          className="h-5 w-5 shrink-0 rounded-full"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-medium text-foreground truncate">
            {coin.symbol}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono-data text-[10px] text-muted-foreground">
            {formatPrice(coin.priceUsd)}
          </span>
          <span
            className={clsx(
              'flex items-center gap-0.5 font-mono-data text-[9px] font-medium',
              isPositive ? 'text-bullish' : 'text-bearish'
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-2 w-2" />
            ) : (
              <TrendingDown className="h-2 w-2" />
            )}
            {formatPercent(coin.changePercent24Hr)}
          </span>
        </div>
      </div>
    </div>
  );
}
