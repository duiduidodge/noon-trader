"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export type CandleMsg = {
  time: number; open: number; high: number; low: number; close: number; volume: number;
};
export type TradeMsg = { price: number; size: number; side: "buy" | "sell"; time: number };
export type BookMsg = { bid: number; ask: number; spread: number };
export type FundingMsg = { rate: number; next_funding_time: number };
export type LiquidationMsg = { side: "buy" | "sell"; size: number; price: number; time: number };
export type OIMsg = { open_interest: number; timestamp: number };

export type StreamHandlers = {
  onCandle?: (c: CandleMsg) => void;
  onTrade?: (t: TradeMsg) => void;
  onBook?: (b: BookMsg) => void;
  onFunding?: (f: FundingMsg) => void;
  onLiquidation?: (l: LiquidationMsg) => void;
  onOI?: (o: OIMsg) => void;
};

export function useChartStream(coin: string, handlers: StreamHandlers) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  const [connected, setConnected] = useState(false);

  // Keep handlers ref current without re-subscribing
  useEffect(() => { handlersRef.current = handlers; });

  const connect = useCallback(() => {
    const base =
      process.env.NEXT_PUBLIC_CHARTS_API_URL ?? "ws://localhost:8080";
    const url = `${base}/ws/${coin}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string; data: unknown };
        const h = handlersRef.current;
        switch (msg.type) {
          case "candle":      h.onCandle?.(msg.data as CandleMsg); break;
          case "trade":       h.onTrade?.(msg.data as TradeMsg); break;
          case "book":        h.onBook?.(msg.data as BookMsg); break;
          case "funding":     h.onFunding?.(msg.data as FundingMsg); break;
          case "liquidation": h.onLiquidation?.(msg.data as LiquidationMsg); break;
          case "oi":          h.onOI?.(msg.data as OIMsg); break;
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 3s
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [coin]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
