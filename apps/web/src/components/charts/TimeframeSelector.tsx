"use client";

import clsx from "clsx";

export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export function TimeframeSelector({
  selected,
  onChange,
}: {
  selected: Timeframe;
  onChange: (tf: Timeframe) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={clsx(
            "px-2.5 py-1 rounded text-xs font-mono transition-all",
            selected === tf
              ? "bg-primary/20 text-primary font-semibold"
              : "text-foreground/40 hover:text-foreground/70 hover:bg-surface"
          )}
        >
          {tf}
        </button>
      ))}
    </div>
  );
}
