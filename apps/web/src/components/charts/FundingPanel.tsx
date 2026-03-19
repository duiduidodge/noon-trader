"use client";

import type { FundingMsg, LiquidationMsg, OIMsg } from "@/hooks/useChartStream";
import clsx from "clsx";

function formatRate(rate: number) {
  if (!rate) return "0.0000%";
  const pct = (rate * 100).toFixed(4);
  return `${rate >= 0 ? "+" : ""}${pct}%`;
}

function formatTime(ms: number) {
  if (!ms) return "—";
  const diff = ms - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtUsd(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtOI(oi: number) {
  if (oi >= 1_000_000) return `${(oi / 1_000_000).toFixed(2)}M`;
  if (oi >= 1_000)     return `${(oi / 1_000).toFixed(1)}K`;
  return oi.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// Severity thresholds (USD)
function liqSeverity(usd: number): "xl" | "lg" | "md" | "sm" {
  if (usd >= 500_000) return "xl";
  if (usd >= 100_000) return "lg";
  if (usd >= 10_000)  return "md";
  return "sm";
}

export function FundingPanel({
  funding,
  oi,
  liquidations,
}: {
  funding: FundingMsg | null;
  oi: OIMsg | null;
  liquidations: LiquidationMsg[];
}) {
  const rate = funding?.rate ?? 0;
  const isPositive = rate > 0;
  const isNegative = rate < 0;

  return (
    <div className="flex flex-col gap-2">

      {/* ── Funding + OI card ─────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-surface/40 overflow-hidden">
        <div className="px-3 py-2 border-b border-border/20">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-foreground/35">
            Derivatives
          </span>
        </div>

        <div className="px-3 py-2.5 space-y-2.5">
          {/* Funding rate */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[9px] font-mono text-foreground/35 uppercase tracking-wider mb-0.5">
                Funding
              </p>
              <span
                className={clsx(
                  "text-xl font-mono font-bold tabular-nums leading-none",
                  isPositive ? "text-bullish" :
                  isNegative ? "text-bearish"  : "text-foreground/50"
                )}
              >
                {formatRate(rate)}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-mono text-foreground/30 mb-0.5">/ 8h</p>
              <p className="text-[10px] font-mono text-foreground/50">
                {formatTime(funding?.next_funding_time ?? 0)}
              </p>
            </div>
          </div>

          {/* Funding direction hint */}
          <div className={clsx(
            "rounded-md px-2 py-1 text-[9px] font-mono",
            isPositive ? "bg-bullish/8 text-bullish/70" :
            isNegative ? "bg-bearish/8 text-bearish/70"  : "bg-surface/60 text-foreground/30"
          )}>
            {isPositive ? "Longs pay shorts — bearish lean" :
             isNegative ? "Shorts pay longs — bullish lean" :
             "Neutral funding rate"}
          </div>

          {/* Open interest */}
          {oi && oi.open_interest > 0 && (
            <div className="flex items-center justify-between border-t border-border/20 pt-2">
              <span className="text-[9px] font-mono text-foreground/35 uppercase tracking-wider">
                Open Interest
              </span>
              <span className="text-[11px] font-mono font-semibold text-foreground/70 tabular-nums">
                {fmtOI(oi.open_interest)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Liquidations card ─────────────────────── */}
      <div className="rounded-xl border border-border/30 bg-surface/40 overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between shrink-0">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-foreground/35">
            Liquidations
          </span>
          {liquidations.length > 0 && (
            <span className="text-[9px] font-mono text-foreground/25">
              {liquidations.length} recent
            </span>
          )}
        </div>

        <div className="overflow-y-auto flex-1" style={{ maxHeight: "200px" }}>
          {liquidations.length === 0 ? (
            <p className="text-[10px] font-mono text-foreground/25 py-4 text-center">
              No recent liquidations
            </p>
          ) : (
            <div className="p-1.5 space-y-0.5">
              {liquidations.map((liq, i) => {
                const usdValue = liq.size * liq.price;
                const sev = liqSeverity(usdValue);
                const isBuy = liq.side === "buy";
                return (
                  <div
                    key={i}
                    className={clsx(
                      "flex items-center justify-between rounded-md px-2 py-1 gap-1",
                      sev === "xl" && (isBuy ? "bg-bullish/15" : "bg-bearish/15"),
                      sev === "lg" && (isBuy ? "bg-bullish/8"  : "bg-bearish/8"),
                      (sev === "md" || sev === "sm") && "bg-transparent",
                    )}
                  >
                    {/* Direction badge */}
                    <span className={clsx(
                      "text-[9px] font-mono font-bold uppercase w-10 shrink-0",
                      isBuy ? "text-bullish" : "text-bearish"
                    )}>
                      {isBuy ? "LONG" : "SHORT"}
                    </span>

                    {/* USD value */}
                    <span className={clsx(
                      "font-mono tabular-nums flex-1 text-right",
                      sev === "xl" ? "text-[11px] font-bold text-foreground/90" :
                      sev === "lg" ? "text-[11px] font-semibold text-foreground/80" :
                      sev === "md" ? "text-[10px] text-foreground/65" :
                                    "text-[10px] text-foreground/40"
                    )}>
                      {fmtUsd(usdValue)}
                    </span>

                    {/* Price */}
                    <span className="text-[9px] font-mono text-foreground/30 w-16 text-right shrink-0 tabular-nums">
                      @{liq.price >= 1000
                        ? liq.price.toLocaleString("en-US", { maximumFractionDigits: 0 })
                        : liq.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
