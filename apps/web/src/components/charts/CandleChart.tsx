"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { CandleMsg } from "@/hooks/useChartStream";
import type { Timeframe } from "./TimeframeSelector";
import type { Coin } from "./CoinSelector";
import { calcSMA, calcEMA, calcRSI, calcVWAP, type OHLCPoint, type IndicatorConfig } from "@/lib/indicators";
import { calcSwingHighsLows, calcFairValueGaps, calcOrderBlocks, calcBreakOfStructure, calcEuphoriaCapitulation } from "@/lib/smc";
import { ZonePrimitive, LevelPrimitive, type ZoneConfig, type LevelConfig } from "@/lib/chart-primitives";

type Props = {
  coin: Coin;
  timeframe: Timeframe;
  latestCandle: CandleMsg | null;
  indicators: IndicatorConfig[];
  showRSI: boolean;
  showSMC: boolean;
};

const BULL_COLOR = "#22c55e";
const BEAR_COLOR = "#ef4444";
const BULL_VOL   = "rgba(34,197,94,0.35)";
const BEAR_VOL   = "rgba(239,68,68,0.35)";

// Swing length per timeframe — higher for lower TFs to avoid noise
const SWING_LENGTH: Record<string, number> = {
  "1m": 10, "5m": 8, "15m": 6, "1h": 5, "4h": 5, "1d": 4,
};

// Throttle interval for SMC recompute on live data (ms)
const SMC_REFRESH_INTERVAL = 5000;

const CHART_THEME = {
  layout: {
    background: { type: ColorType.Solid, color: "#0d1410" },
    textColor: "#7fa07f",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 11,
  },
  grid: {
    vertLines: { color: "#161e17" },
    horzLines: { color: "#161e17" },
  },
  rightPriceScale: { borderColor: "#1e2b1f" },
  timeScale: { borderColor: "#1e2b1f", timeVisible: true, secondsVisible: false },
};

function calcIndicatorPoints(config: IndicatorConfig, data: OHLCPoint[]) {
  if (config.type === "sma") return calcSMA(data, config.period);
  if (config.type === "ema") return calcEMA(data, config.period);
  if (config.type === "vwap") return calcVWAP(data, config.period);
  return calcSMA(data, config.period);
}

function CandleChart({ coin, timeframe, latestCandle, indicators, showRSI, showSMC }: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);

  const chartRef    = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rsiSeriesRef = useRef<any>(null);

  // Dynamic MA/EMA series — keyed by IndicatorConfig.id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());

  // SMC primitives
  const zonePrimitiveRef  = useRef<ZonePrimitive | null>(null);
  const levelPrimitiveRef = useRef<LevelPrimitive | null>(null);

  // Keep latest candle data accessible to effects without re-running the main effect
  const candleDataRef = useRef<OHLCPoint[]>([]);

  // Keep latest indicators accessible inside the fetch callback
  const currentIndicatorsRef = useRef(indicators);
  currentIndicatorsRef.current = indicators;

  const currentShowSMCRef = useRef(showSMC);
  currentShowSMCRef.current = showSMC;

  const currentTimeframeRef = useRef(timeframe);
  currentTimeframeRef.current = timeframe;

  const smcThrottleRef = useRef(0);

  const syncingRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const [status, setStatus] = useState("mounting…");

  // ── Refresh all computed overlays (indicators + SMC) from candleDataRef ──
  const refreshOverlays = useCallback(() => {
    const data = candleDataRef.current;
    if (data.length === 0) return;

    // Update indicator series
    for (const config of currentIndicatorsRef.current) {
      const s = indicatorSeriesRef.current.get(config.id);
      if (s) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        s.setData(calcIndicatorPoints(config, data) as any);
      }
    }

    // Update RSI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rsiSeriesRef.current?.setData(calcRSI(data, 14) as any);
  }, []);

  // ── SMC computation helper ────────────────────────────────────────────────
  const computeSMC = useCallback((data: OHLCPoint[]) => {
    if (!currentShowSMCRef.current) {
      zonePrimitiveRef.current?.setZones([]);
      levelPrimitiveRef.current?.setLevels([]);
      seriesRef.current?.setMarkers([]);
      return;
    }
    if (data.length < 30) return;

    const swLen = SWING_LENGTH[currentTimeframeRef.current] ?? 5;
    const swings = calcSwingHighsLows(data, swLen);
    const fvgs = calcFairValueGaps(data);
    const obs = calcOrderBlocks(data, swings);
    const bos = calcBreakOfStructure(data, swings);

    // Zones: FVGs + unmitigated Order Blocks
    const zones: ZoneConfig[] = [];

    // Only show recent FVGs (last 60% of data) to avoid clutter
    const fvgCutoff = data.length > 50 ? data[Math.floor(data.length * 0.3)].time : 0;
    for (const fvg of fvgs) {
      if (fvg.startTime < fvgCutoff) continue;
      zones.push({
        startTime: fvg.startTime,
        endTime: fvg.endTime,
        top: fvg.top,
        bottom: fvg.bottom,
        fillColor: fvg.direction === 1 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        borderColor: fvg.direction === 1 ? "rgba(34,197,94,0.40)" : "rgba(239,68,68,0.40)",
      });
    }

    for (const ob of obs) {
      if (ob.mitigated) continue;
      zones.push({
        startTime: ob.startTime,
        endTime: 0, // extend to right edge
        top: ob.top,
        bottom: ob.bottom,
        fillColor: ob.direction === 1 ? "rgba(0,188,212,0.14)" : "rgba(171,71,188,0.14)",
        borderColor: ob.direction === 1 ? "rgba(0,188,212,0.50)" : "rgba(171,71,188,0.50)",
        label: ob.direction === 1 ? "OB+" : "OB-",
        labelColor: ob.direction === 1 ? "rgba(0,188,212,0.85)" : "rgba(171,71,188,0.85)",
      });
    }

    zonePrimitiveRef.current?.setZones(zones);

    // Levels: BOS / CHoCH
    const levels: LevelConfig[] = bos.map((b) => ({
      time: b.time,
      level: b.level,
      color: b.type === "BOS" ? "#00e5ff" : "#ffd740",
      label: `${b.type} ${b.direction === 1 ? "▲" : "▼"}`,
    }));

    levelPrimitiveRef.current?.setLevels(levels);

    // Markers: swing highs/lows + euphoria/capitulation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markers: any[] = swings.map((sw) => ({
      time: sw.time,
      position: sw.direction === 1 ? "aboveBar" : "belowBar",
      color: sw.direction === 1 ? "#ffffff99" : "#ffffff99",
      shape: "circle",
      text: sw.direction === 1 ? "H" : "L",
      size: 0.3,
    }));

    // Euphoria & Capitulation markers
    const ec = calcEuphoriaCapitulation(data);
    for (const sig of ec) {
      markers.push({
        time: sig.time,
        position: sig.type === 1 ? "aboveBar" : "belowBar",
        color: sig.type === 1 ? "#ff6d00" : "#00e676",
        shape: sig.type === 1 ? "arrowDown" : "arrowUp",
        text: sig.type === 1 ? "E" : "C",
        size: 1,
      });
    }

    // Sort markers by time (required by lightweight-charts)
    markers.sort((a, b) => a.time - b.time);
    seriesRef.current?.setMarkers(markers);
  }, []);

  // ── Main chart + RSI init (reruns on coin/timeframe change only) ────────
  useEffect(() => {
    let destroyed = false;
    setStatus("rAF pending…");

    const rafId = requestAnimationFrame(() => {
      if (destroyed) return;
      if (!containerRef.current || !rsiContainerRef.current) {
        setStatus("no container ref");
        return;
      }

      const el    = containerRef.current;
      const rsiEl = rsiContainerRef.current;
      const w = el.offsetWidth  || window.innerWidth;
      const h = el.offsetHeight || Math.floor(window.innerHeight * 0.6);
      setStatus(`${w}×${h} — creating chart…`);

      // ── Main chart ──────────────────────────────────────────────────────
      let chart: IChartApi;
      try {
        chart = createChart(el, {
          ...CHART_THEME,
          width: w, height: h,
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { color: "rgba(82,186,100,0.4)", labelBackgroundColor: "#0d1410" },
            horzLine: { color: "rgba(82,186,100,0.4)", labelBackgroundColor: "#0d1410" },
          },
          handleScroll: true,
          handleScale:  true,
        });
      } catch (err) {
        setStatus(`createChart error: ${err}`);
        return;
      }

      // Candlestick
      const series = chart.addCandlestickSeries({
        upColor: BULL_COLOR, downColor: BEAR_COLOR,
        borderUpColor: BULL_COLOR, borderDownColor: BEAR_COLOR,
        wickUpColor: BULL_COLOR, wickDownColor: BEAR_COLOR,
      });

      // SMC primitives — attach to candlestick series
      const zonePrimitive = new ZonePrimitive();
      const levelPrimitive = new LevelPrimitive();
      series.attachPrimitive(zonePrimitive);
      series.attachPrimitive(levelPrimitive);
      zonePrimitiveRef.current = zonePrimitive;
      levelPrimitiveRef.current = levelPrimitive;

      // Volume histogram
      const volSeries = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      chart.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });

      // ── RSI chart ───────────────────────────────────────────────────────
      const rsiChart = createChart(rsiEl, {
        ...CHART_THEME,
        width:  rsiEl.offsetWidth  || w,
        height: rsiEl.offsetHeight || 120,
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "rgba(82,186,100,0.3)", labelBackgroundColor: "#0d1410" },
          horzLine: { color: "rgba(82,186,100,0.3)", labelBackgroundColor: "#0d1410" },
        },
        handleScroll: true,
        handleScale:  false,
        rightPriceScale: {
          borderColor: "#1e2b1f",
          scaleMargins: { top: 0.1, bottom: 0.1 },
          autoScale: false,
        },
        timeScale: { borderColor: "#1e2b1f", timeVisible: false, secondsVisible: false },
        leftPriceScale: { visible: false },
      });

      const rsiSeries = rsiChart.addLineSeries({
        color: "#d946ef",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      });
      for (const { price, color } of [
        { price: 70, color: "rgba(239,68,68,0.5)"  },
        { price: 30, color: "rgba(34,197,94,0.5)"  },
        { price: 50, color: "rgba(255,255,255,0.15)" },
      ]) {
        rsiSeries.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
      }

      // ── Time range sync ─────────────────────────────────────────────────
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncingRef.current || !range) return;
        syncingRef.current = true;
        rsiChart.timeScale().setVisibleLogicalRange(range);
        syncingRef.current = false;
      });
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncingRef.current || !range) return;
        syncingRef.current = true;
        chart.timeScale().setVisibleLogicalRange(range);
        syncingRef.current = false;
      });

      // ── Assign refs ─────────────────────────────────────────────────────
      chartRef.current     = chart;
      rsiChartRef.current  = rsiChart;
      seriesRef.current    = series;
      volSeriesRef.current = volSeries;
      rsiSeriesRef.current = rsiSeries;

      // ── ResizeObserver ───────────────────────────────────────────────────
      const ro = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width:  containerRef.current.offsetWidth,
            height: containerRef.current.offsetHeight,
          });
        }
        if (rsiContainerRef.current && rsiChartRef.current) {
          rsiChartRef.current.applyOptions({
            width:  rsiContainerRef.current.offsetWidth,
            height: rsiContainerRef.current.offsetHeight,
          });
        }
      });
      ro.observe(el);
      ro.observe(rsiEl);

      // ── Fetch historical candles ─────────────────────────────────────────
      const base = (process.env.NEXT_PUBLIC_CHARTS_API_URL ?? "http://localhost:8080")
        .replace(/^wss:\/\//, "https://")
        .replace(/^ws:\/\//, "http://");

      setStatus(`fetching ${coin}…`);

      fetch(`${base}/candles/${coin}?tf=${timeframe}&limit=300`)
        .then((r) => r.json())
        .then((data: OHLCPoint[]) => {
          if (destroyed || !seriesRef.current) return;
          if (!Array.isArray(data) || data.length === 0) {
            setStatus("fetch ok but empty");
            return;
          }

          // Candles + volume
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          seriesRef.current.setData(data as any);
          volSeriesRef.current?.setData(
            data.map((c) => ({
              time: c.time, value: c.volume,
              color: c.close >= c.open ? BULL_VOL : BEAR_VOL,
            }))
          );

          // RSI
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rsiSeriesRef.current?.setData(calcRSI(data, 14) as any);
          rsiChart.priceScale("right").applyOptions({ autoScale: true });

          // Store candle data for indicator effects
          candleDataRef.current = data;

          // Build all current indicator series
          for (const config of currentIndicatorsRef.current) {
            const pts = calcIndicatorPoints(config, data);
            const s = chart.addLineSeries({
              color: config.color,
              lineWidth: 1,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: false,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            s.setData(pts as any);
            indicatorSeriesRef.current.set(config.id, s);
          }

          // Compute SMC overlays
          computeSMC(data);

          chartRef.current?.timeScale().fitContent();
          setStatus("");
        })
        .catch((err) => setStatus(`fetch error: ${err}`));

      cleanupRef.current = () => {
        ro.disconnect();
        chart.remove();
        rsiChart.remove();
        chartRef.current     = null;
        rsiChartRef.current  = null;
        seriesRef.current    = null;
        volSeriesRef.current = null;
        rsiSeriesRef.current = null;
        indicatorSeriesRef.current.clear();
        zonePrimitiveRef.current  = null;
        levelPrimitiveRef.current = null;
        candleDataRef.current = [];
        cleanupRef.current    = null;
      };
    });

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      cleanupRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin, timeframe]);

  // ── Dynamic indicator series (add/remove/update periods) ────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const data  = candleDataRef.current;
    if (!chart || data.length === 0) return;

    const existing = indicatorSeriesRef.current;
    const newIds = new Set(indicators.map((i) => i.id));

    // Remove deleted indicators
    for (const [id, s] of [...existing]) {
      if (!newIds.has(id)) {
        try { chart.removeSeries(s); } catch { /* already gone */ }
        existing.delete(id);
      }
    }

    // Add new or update existing
    for (const config of indicators) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pts = calcIndicatorPoints(config, data) as any;
      if (existing.has(config.id)) {
        const s = existing.get(config.id)!;
        s.setData(pts);
        s.applyOptions({ color: config.color });
      } else {
        const s = chart.addLineSeries({
          color: config.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData(pts);
        existing.set(config.id, s);
      }
    }
  }, [indicators]);

  // ── Live candle updates ─────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || !latestCandle) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      seriesRef.current.update(latestCandle as any);
      volSeriesRef.current?.update({
        time: latestCandle.time, value: latestCandle.volume,
        color: latestCandle.close >= latestCandle.open ? BULL_VOL : BEAR_VOL,
      });

      // Update candleDataRef with latest candle data
      const data = candleDataRef.current;
      if (data.length > 0) {
        const last = data[data.length - 1];
        if (last.time === latestCandle.time) {
          // Update existing candle in-place
          data[data.length - 1] = latestCandle;
        } else if (latestCandle.time > last.time) {
          // New candle — append and trim
          data.push(latestCandle);
          if (data.length > 350) data.splice(0, data.length - 300);
        }
      }

      // Throttled refresh of overlays (indicators + SMC)
      const now = Date.now();
      if (now - smcThrottleRef.current > SMC_REFRESH_INTERVAL) {
        smcThrottleRef.current = now;
        refreshOverlays();
        computeSMC(data);
      }
    } catch { /* not ready */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestCandle]);

  // ── SMC toggle ────────────────────────────────────────────────────────────
  useEffect(() => {
    computeSMC(candleDataRef.current);
  }, [showSMC, computeSMC]);

  // ── RSI chart height when toggled ───────────────────────────────────────
  useEffect(() => {
    if (!rsiChartRef.current || !rsiContainerRef.current) return;
    rsiChartRef.current.applyOptions({
      width:  rsiContainerRef.current.offsetWidth,
      height: rsiContainerRef.current.offsetHeight || 120,
    });
  }, [showRSI]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, width: "100%" }} />

      {/* RSI pane — height animated via CSS */}
      <div
        ref={rsiContainerRef}
        style={{
          width: "100%",
          height: showRSI ? 120 : 0,
          overflow: "hidden",
          transition: "height 0.2s ease",
          borderTop: showRSI ? "1px solid #1e2b1f" : "none",
        }}
      />

      {status && (
        <div style={{
          position: "absolute", top: 8, left: 8, zIndex: 10,
          background: "rgba(0,0,0,0.75)", color: "#4ade80",
          fontFamily: "monospace", fontSize: 11, padding: "4px 8px",
          borderRadius: 4, pointerEvents: "none",
          maxWidth: "90%", wordBreak: "break-all",
        }}>
          {status}
        </div>
      )}
    </div>
  );
}

export default CandleChart;
