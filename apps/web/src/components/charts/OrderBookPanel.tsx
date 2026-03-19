"use client";

import type { BookMsg } from "@/hooks/useChartStream";

function fmtPrice(n: number) {
  if (!n) return "—";
  if (n >= 10000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 100)   return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtSpread(bid: number, ask: number) {
  if (!bid || !ask) return null;
  const abs = ask - bid;
  if (abs <= 0) return null;
  // Show dollar spread for high-value coins, else show %
  if (ask >= 100) return `$${abs.toFixed(2)}`;
  return `$${abs.toFixed(4)}`;
}

export function OrderBookPanel({ book }: { book: BookMsg | null }) {
  const spread = book ? fmtSpread(book.bid, book.ask) : null;

  return (
    <div className="rounded-xl border border-border/30 bg-surface/40 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/20">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-foreground/35">
          Market
        </span>
      </div>

      <div className="px-3 py-2.5 space-y-0">
        {/* Ask row */}
        <div className="flex items-center justify-between gap-3 py-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1 h-5 rounded-full bg-bearish/50 shrink-0" />
            <span className="text-[10px] font-mono text-foreground/40 uppercase tracking-wider">Ask</span>
          </div>
          <span className="text-sm font-mono font-semibold text-bearish tabular-nums">
            {fmtPrice(book?.ask ?? 0)}
          </span>
        </div>

        {/* Spread divider */}
        <div className="flex items-center gap-2 py-0.5">
          <div className="w-1 shrink-0" />
          <div className="flex-1 flex items-center gap-1.5 ml-2">
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-[9px] font-mono text-foreground/30 shrink-0">
              {spread ?? "—"}
            </span>
            <div className="flex-1 h-px bg-border/40" />
          </div>
        </div>

        {/* Bid row */}
        <div className="flex items-center justify-between gap-3 py-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1 h-5 rounded-full bg-bullish/50 shrink-0" />
            <span className="text-[10px] font-mono text-foreground/40 uppercase tracking-wider">Bid</span>
          </div>
          <span className="text-sm font-mono font-semibold text-bullish tabular-nums">
            {fmtPrice(book?.bid ?? 0)}
          </span>
        </div>
      </div>
    </div>
  );
}
