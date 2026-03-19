"use client";

import clsx from "clsx";

export const COINS = ["BTC", "ETH", "SOL", "XRP"] as const;
export type Coin = (typeof COINS)[number];

const COIN_COLORS: Record<Coin, string> = {
  BTC: "#f7931a",
  ETH: "#627eea",
  SOL: "#9945ff",
  XRP: "#346aa9",
};

export function CoinSelector({
  selected,
  onChange,
}: {
  selected: Coin;
  onChange: (c: Coin) => void;
}) {
  return (
    <div className="flex gap-1">
      {COINS.map((coin) => (
        <button
          key={coin}
          onClick={() => onChange(coin)}
          className={clsx(
            "px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all",
            selected === coin
              ? "text-background"
              : "text-foreground/50 hover:text-foreground bg-surface hover:bg-surface/80"
          )}
          style={
            selected === coin
              ? { backgroundColor: COIN_COLORS[coin], color: "#0a0f0a" }
              : {}
          }
        >
          {coin}
        </button>
      ))}
    </div>
  );
}
