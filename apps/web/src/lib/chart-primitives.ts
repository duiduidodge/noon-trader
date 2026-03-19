/**
 * Custom lightweight-charts primitives for drawing SMC overlays.
 * Uses the ISeriesPrimitive API (v4.x) with fancy-canvas rendering.
 */

import type {
  ISeriesPrimitive,
  ISeriesPrimitivePaneView,
  ISeriesPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
  IChartApi,
  ISeriesApi,
  SeriesType,
} from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";

// ── Zone Primitive (rectangles for FVG / OB) ─────────────────────────────────

interface ZoneConfig {
  startTime: number; // Unix seconds
  endTime: number;   // Unix seconds (0 = extend to right edge)
  top: number;       // Price
  bottom: number;    // Price
  fillColor: string;
  borderColor: string;
  label?: string;
  labelColor?: string;
}

class ZoneRenderer implements ISeriesPrimitivePaneRenderer {
  private _zones: ZoneConfig[];
  private _chart: IChartApi;
  private _series: ISeriesApi<SeriesType>;

  constructor(zones: ZoneConfig[], chart: IChartApi, series: ISeriesApi<SeriesType>) {
    this._zones = zones;
    this._chart = chart;
    this._series = series;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const timeScale = this._chart.timeScale();

      for (const zone of this._zones) {
        const x1Raw = timeScale.timeToCoordinate(zone.startTime as Time);
        const x2Raw = zone.endTime
          ? timeScale.timeToCoordinate(zone.endTime as Time)
          : null;

        if (x1Raw === null) continue;
        const x1 = x1Raw as unknown as number;
        const x2 = (x2Raw !== null ? x2Raw as unknown as number : mediaSize.width);

        const y1Raw = this._series.priceToCoordinate(zone.top);
        const y2Raw = this._series.priceToCoordinate(zone.bottom);
        if (y1Raw === null || y2Raw === null) continue;
        const y1 = y1Raw as unknown as number;
        const y2 = y2Raw as unknown as number;

        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const yTop = Math.min(y1, y2);
        const yBot = Math.max(y1, y2);

        // Fill
        ctx.fillStyle = zone.fillColor;
        ctx.fillRect(left, yTop, right - left, yBot - yTop);

        // Border
        ctx.strokeStyle = zone.borderColor;
        ctx.lineWidth = 0.7;
        ctx.strokeRect(left, yTop, right - left, yBot - yTop);

        // Label
        if (zone.label) {
          ctx.fillStyle = zone.labelColor ?? zone.borderColor;
          ctx.font = "bold 9px monospace";
          ctx.fillText(zone.label, left + 3, yTop - 3);
        }
      }
    });
  }
}

class ZonePaneView implements ISeriesPrimitivePaneView {
  private _zones: ZoneConfig[];
  private _chart: IChartApi;
  private _series: ISeriesApi<SeriesType>;

  constructor(zones: ZoneConfig[], chart: IChartApi, series: ISeriesApi<SeriesType>) {
    this._zones = zones;
    this._chart = chart;
    this._series = series;
  }

  zOrder(): "bottom" { return "bottom"; }

  renderer(): ISeriesPrimitivePaneRenderer {
    return new ZoneRenderer(this._zones, this._chart, this._series);
  }
}

export class ZonePrimitive implements ISeriesPrimitive<Time> {
  private _zones: ZoneConfig[] = [];
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _requestUpdate?: () => void;

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = undefined;
  }

  setZones(zones: ZoneConfig[]): void {
    this._zones = zones;
    this._requestUpdate?.();
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    if (!this._chart || !this._series) return [];
    return [new ZonePaneView(this._zones, this._chart, this._series)];
  }
}

// ── Level Primitive (dashed lines for BOS / CHoCH) ───────────────────────────

interface LevelConfig {
  time: number;     // Unix seconds — center point of the line
  level: number;    // Price
  color: string;
  label: string;
  spanCandles?: number; // How many candles to span left/right (default 8)
}

class LevelRenderer implements ISeriesPrimitivePaneRenderer {
  private _levels: LevelConfig[];
  private _chart: IChartApi;
  private _series: ISeriesApi<SeriesType>;

  constructor(levels: LevelConfig[], chart: IChartApi, series: ISeriesApi<SeriesType>) {
    this._levels = levels;
    this._chart = chart;
    this._series = series;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      const timeScale = this._chart.timeScale();

      for (const lvl of this._levels) {
        const cxRaw = timeScale.timeToCoordinate(lvl.time as Time);
        const yRaw = this._series.priceToCoordinate(lvl.level);
        if (cxRaw === null || yRaw === null) continue;
        const cx = cxRaw as unknown as number;
        const y = yRaw as unknown as number;

        const span = 80; // pixels each side
        const x1 = cx - span;
        const x2 = cx + span;

        // Dashed line
        ctx.strokeStyle = lvl.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        ctx.fillStyle = lvl.color;
        ctx.font = "bold 9px monospace";
        ctx.fillText(lvl.label, x2 + 4, y + 3);
      }
    });
  }
}

class LevelPaneView implements ISeriesPrimitivePaneView {
  private _levels: LevelConfig[];
  private _chart: IChartApi;
  private _series: ISeriesApi<SeriesType>;

  constructor(levels: LevelConfig[], chart: IChartApi, series: ISeriesApi<SeriesType>) {
    this._levels = levels;
    this._chart = chart;
    this._series = series;
  }

  zOrder(): "top" { return "top"; }

  renderer(): ISeriesPrimitivePaneRenderer {
    return new LevelRenderer(this._levels, this._chart, this._series);
  }
}

export class LevelPrimitive implements ISeriesPrimitive<Time> {
  private _levels: LevelConfig[] = [];
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<SeriesType> | null = null;
  private _requestUpdate?: () => void;

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = undefined;
  }

  setLevels(levels: LevelConfig[]): void {
    this._levels = levels;
    this._requestUpdate?.();
  }

  paneViews(): readonly ISeriesPrimitivePaneView[] {
    if (!this._chart || !this._series) return [];
    return [new LevelPaneView(this._levels, this._chart, this._series)];
  }
}

export type { ZoneConfig, LevelConfig };
