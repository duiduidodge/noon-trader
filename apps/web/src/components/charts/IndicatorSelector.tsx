"use client";

import { useState, useRef, useEffect } from "react";
import type { IndicatorConfig } from "@/lib/indicators";

export const SMA_PALETTE = ["#f59e0b", "#8b5cf6", "#3b82f6", "#ec4899", "#10b981", "#f43f5e"];
export const EMA_PALETTE = ["#f97316", "#06b6d4", "#84cc16", "#fb7185", "#7c3aed", "#0ea5e9"];
export const VWAP_PALETTE = ["#e879f9", "#22d3ee", "#a3e635"];

type Props = {
  indicators: IndicatorConfig[];
  showRSI: boolean;
  showSMC: boolean;
  onAdd: (type: "sma" | "ema" | "vwap") => void;
  onRemove: (id: string) => void;
  onPeriodChange: (id: string, period: number) => void;
  onToggleRSI: () => void;
  onToggleSMC: () => void;
};

export function IndicatorSelector({
  indicators, showRSI, showSMC, onAdd, onRemove, onPeriodChange, onToggleRSI, onToggleSMC,
}: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !panelRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const smas = indicators.filter((i) => i.type === "sma");
  const emas = indicators.filter((i) => i.type === "ema");
  const vwaps = indicators.filter((i) => i.type === "vwap");
  const count = indicators.length + (showRSI ? 1 : 0) + (showSMC ? 1 : 0);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-md border transition-all duration-150"
        style={{
          borderColor: open ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)",
          color:       open ? "rgba(255,255,255,0.6)"  : "rgba(255,255,255,0.35)",
          background:  open ? "rgba(255,255,255,0.04)" : "transparent",
        }}
      >
        <span>Indicators</span>
        {count > 0 && (
          <span
            className="text-[8px] tabular-nums px-1 py-0.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
          >
            {count}
          </span>
        )}
        <span style={{ fontSize: 7, opacity: 0.35 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-1.5 z-50 rounded-xl border border-border/30 bg-background shadow-2xl"
          style={{ width: 252, padding: "10px 12px" }}
        >
          {/* MA section */}
          <IndicatorSection
            label="Moving Average (MA)"
            items={smas}
            typeLabel="MA"
            onAdd={() => onAdd("sma")}
            onRemove={onRemove}
            onPeriodChange={onPeriodChange}
          />

          <div className="my-2.5 border-t border-border/15" />

          {/* EMA section */}
          <IndicatorSection
            label="Exponential MA (EMA)"
            items={emas}
            typeLabel="EMA"
            onAdd={() => onAdd("ema")}
            onRemove={onRemove}
            onPeriodChange={onPeriodChange}
          />

          <div className="my-2.5 border-t border-border/15" />

          {/* VWAP section */}
          <IndicatorSection
            label="VWAP"
            items={vwaps}
            typeLabel="VWAP"
            onAdd={() => onAdd("vwap")}
            onRemove={onRemove}
            onPeriodChange={onPeriodChange}
          />

          <div className="my-2.5 border-t border-border/15" />

          {/* RSI */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-foreground/50">RSI</span>
              <span className="ml-1.5 text-[9px] font-mono text-foreground/25">period 14</span>
            </div>
            <button
              onClick={onToggleRSI}
              className="text-[9px] font-mono px-2.5 py-0.5 rounded-full border transition-all duration-150"
              style={{
                borderColor: showRSI ? "#d946ef" : "rgba(255,255,255,0.08)",
                color:       showRSI ? "#d946ef" : "rgba(255,255,255,0.25)",
                background:  showRSI ? "rgba(217,70,239,0.1)" : "transparent",
              }}
            >
              {showRSI ? "on" : "off"}
            </button>
          </div>

          <div className="my-2.5 border-t border-border/15" />

          {/* SMC */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono text-foreground/50">SMC</span>
              <span className="ml-1.5 text-[9px] font-mono text-foreground/25">FVG · OB · BOS</span>
            </div>
            <button
              onClick={onToggleSMC}
              className="text-[9px] font-mono px-2.5 py-0.5 rounded-full border transition-all duration-150"
              style={{
                borderColor: showSMC ? "#00e5ff" : "rgba(255,255,255,0.08)",
                color:       showSMC ? "#00e5ff" : "rgba(255,255,255,0.25)",
                background:  showSMC ? "rgba(0,229,255,0.1)" : "transparent",
              }}
            >
              {showSMC ? "on" : "off"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IndicatorSection({
  label, items, typeLabel, onAdd, onRemove, onPeriodChange,
}: {
  label: string;
  items: IndicatorConfig[];
  typeLabel: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onPeriodChange: (id: string, period: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[8px] font-mono uppercase tracking-[0.15em] text-foreground/25 mb-2">
        {label}
      </p>

      {items.length === 0 && (
        <p className="text-[9px] font-mono text-foreground/20 italic mb-1">none</p>
      )}

      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2">
          {/* Color dot */}
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: item.color }}
          />

          {/* Period input */}
          <PeriodInput
            value={item.period}
            onChange={(v) => onPeriodChange(item.id, v)}
          />

          {/* Type label */}
          <span className="text-[9px] font-mono text-foreground/30 flex-1">
            {typeLabel}
          </span>

          {/* Remove */}
          <button
            onClick={() => onRemove(item.id)}
            className="text-[11px] leading-none text-foreground/20 hover:text-bearish/70 transition-colors px-0.5"
          >
            ×
          </button>
        </div>
      ))}

      <button
        onClick={onAdd}
        className="text-[9px] font-mono text-foreground/30 hover:text-foreground/55 transition-colors flex items-center gap-1 mt-0.5"
      >
        <span className="text-[11px] leading-none">+</span> Add {typeLabel}
      </button>
    </div>
  );
}

function PeriodInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [local, setLocal] = useState(String(value));

  // Sync when value changes from outside (e.g., prop reset)
  useEffect(() => { setLocal(String(value)); }, [value]);

  return (
    <input
      type="number"
      min={2}
      max={999}
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        const v = parseInt(e.target.value, 10);
        if (v >= 2 && v <= 999) onChange(v);
      }}
      onBlur={() => {
        const v = parseInt(local, 10);
        if (!v || v < 2 || v > 999) setLocal(String(value));
      }}
      className="w-11 text-[10px] font-mono text-right rounded px-1.5 py-0.5 focus:outline-none"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "rgba(255,255,255,0.6)",
      }}
    />
  );
}
