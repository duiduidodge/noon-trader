"use client";

import type { TradeMsg } from "@/hooks/useChartStream";
import clsx from "clsx";

function fmtPrice(n: number) {
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 100)   return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function fmtVol(usd: number) {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000)     return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

const WHALE_USD = 50_000;

export function TradesPanel({ trades }: { trades: TradeMsg[] }) {
  let buyVol = 0, sellVol = 0;
  for (const t of trades) {
    const usd = t.price * t.size;
    if (t.side === "buy") buyVol += usd; else sellVol += usd;
  }
  const totalVol = buyVol + sellVol;
  const buyPct = totalVol > 0 ? (buyVol / totalVol) * 100 : 50;

  return (
    <div className="border-t border-border/25 bg-background/60 shrink-0">
      {/* Flow ratio row */}
      <div className="flex items-center gap-3 px-4 pt-2 pb-1.5">
        {/* Buy label + vol */}
        <div className="flex items-center gap-1.5 w-20 shrink-0">
          <span className="text-[10px] font-mono font-semibold text-bullish tabular-nums">
            {buyPct.toFixed(1)}%
          </span>
          <span className="text-[9px] font-mono text-foreground/30">
            {fmtVol(buyVol)}
          </span>
        </div>

        {/* Bar */}
        <div className="flex-1 h-2 rounded-full overflow-hidden bg-surface/80 flex">
          <div
            className="h-full rounded-full bg-bullish/60 transition-all duration-500"
            style={{ width: `${buyPct}%` }}
          />
          <div className="h-full flex-1 bg-bearish/50" />
        </div>

        {/* Sell label + vol */}
        <div className="flex items-center gap-1.5 w-20 shrink-0 justify-end">
          <span className="text-[9px] font-mono text-foreground/30">
            {fmtVol(sellVol)}
          </span>
          <span className="text-[10px] font-mono font-semibold text-bearish tabular-nums">
            {(100 - buyPct).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Trade chips */}
      <div className="flex items-center gap-1 px-4 pb-2.5 overflow-x-auto no-scrollbar">
        {trades.length === 0 ? (
          <span className="text-[10px] font-mono text-foreground/20">waiting for stream…</span>
        ) : (
          trades.slice(0, 38).map((t, i) => {
            const usd = t.price * t.size;
            const isWhale = usd >= WHALE_USD;
            const isBuy = t.side === "buy";
            return (
              <span
                key={i}
                title={`${isBuy ? "BUY" : "SELL"} ${t.size} @ ${fmtPrice(t.price)} = ${fmtVol(usd)}`}
                className={clsx(
                  "shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded transition-all duration-200",
                  i === 0 ? "opacity-100" : i < 4 ? "opacity-80" : i < 12 ? "opacity-55" : "opacity-30",
                  isWhale ? clsx(
                    "font-bold px-2 py-1 border",
                    isBuy
                      ? "bg-bullish/15 text-bullish border-bullish/30"
                      : "bg-bearish/15 text-bearish border-bearish/30"
                  ) : clsx(
                    isBuy ? "text-bullish/75" : "text-bearish/75"
                  )
                )}
              >
                {isBuy ? "▲" : "▼"}&thinsp;{fmtPrice(t.price)}
                {isWhale && (
                  <span className="ml-1 text-[8px] opacity-70">
                    {fmtVol(usd)}
                  </span>
                )}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
