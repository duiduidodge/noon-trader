import type { MarketRegime } from '../scoring-functions.js';

/**
 * Paper Trading System — Type Definitions
 */

// ── Configuration ────────────────────────────────────────────────────────────

export interface PaperTradingConfig {
  /** Assets to trade */
  assets: string[];
  /** % of equity to risk per trade (e.g., 1 = 1%) */
  riskPerTradePct: number;
  /** Minimum R:R ratio to accept a trade */
  minRR: number;
  /** Max concurrent open positions */
  maxConcurrent: number;
  /** Max portfolio risk (sum of all position risks) as % */
  maxPortfolioRiskPct: number;
  /** Daily loss limit as % of equity */
  dailyLossLimitPct: number;
  /** Drawdown circuit breaker as % from peak equity */
  maxDrawdownPct: number;
  /** Max leverage */
  maxLeverage: number;
  /** Max notional exposure per position as a multiple of equity before leverage cap */
  maxPositionEquityMultiple: number;
  /** Min SL distance as % */
  minSlPct: number;
  /** Max SL distance as % */
  maxSlPct: number;
  /** Slippage buffer for simulated fills as % */
  slippagePct: number;
  /** Starting paper equity in USD */
  initialEquity: number;
  /** Cycle interval in seconds */
  cycleIntervalSeconds: number;
  /** Max hours a position can stay open before forced exit */
  maxHoldHours: number;
  /** ADX minimum to consider market trending (regime filter) */
  minAdxTrending: number;
  /** Minimum confluence score to take a trade (default 45) */
  minEntryScore: number;
  /** Maximum age in candles for the most recent BOS/CHoCH to remain tradable */
  maxBosAgeCandles: number;
  /** Cooldown hours after SL hit before re-entering same asset */
  reEntryCooldownHours: number;
  /** Exchange maker fee in basis points */
  makerFeeBps: number;
  /** Exchange taker fee in basis points */
  takerFeeBps: number;
  /** Whether to hard-block entries using Hyperliquid funding/liquidity filters */
  enableHlContextFilters: boolean;
  /** Max adverse hourly funding tolerated before rejecting an entry */
  maxAdverseFundingRateHourly: number;
  /** Minimum 24h notional volume required for Hyperliquid context */
  minDayVolumeUsd: number;
  /** Minimum open interest required for Hyperliquid context */
  minOpenInterestUsd: number;
  /** ADX threshold considered a strong trend for exit tuning */
  strongTrendAdx: number;
}

export type SignalRejectionReason =
  | 'no_structure'
  | 'adx'
  | 'stale_bos'
  | 'ec_veto'
  | 'score'
  | 'no_sl_level'
  | 'sl_bounds'
  | 'rr'
  | 'four_hour_bias'
  | 'risk';

export interface CycleDiagnostics {
  evaluatedAt: string;
  assetsEvaluated: number;
  acceptedSignals: number;
  openedPositions: number;
  placedOrders: number;
  rejectionCounts: Record<SignalRejectionReason, number>;
}

export const DEFAULT_CONFIG: PaperTradingConfig = {
  assets: ['BTC', 'ETH', 'SOL'],
  riskPerTradePct: 5,
  minRR: 2.0,
  maxConcurrent: 3,
  maxPortfolioRiskPct: 15,
  dailyLossLimitPct: 3,
  maxDrawdownPct: 10,
  maxLeverage: 10,
  maxPositionEquityMultiple: 0.5,
  minSlPct: 0.3,
  maxSlPct: 8.0,
  slippagePct: 0.05,
  initialEquity: 10000,
  cycleIntervalSeconds: 300,
  maxHoldHours: 72,
  minAdxTrending: 15,
  minEntryScore: 35,
  maxBosAgeCandles: 40,
  reEntryCooldownHours: 8,
  makerFeeBps: 1.5,
  takerFeeBps: 4.5,
  enableHlContextFilters: false,
  maxAdverseFundingRateHourly: 0.0002,
  minDayVolumeUsd: 25_000_000,
  minOpenInterestUsd: 10_000_000,
  strongTrendAdx: 28,
};

// ── SMC Analysis ─────────────────────────────────────────────────────────────

export interface SmcAnalysis {
  asset: string;
  timeframe: string;
  swings: {
    indices: number[];
    directions: number[];
    levels: number[];
  };
  fvgs: {
    index: number;
    direction: 1 | -1;
    top: number;
    bottom: number;
    mitigatedIndex: number;
  }[];
  orderBlocks: {
    index: number;
    direction: 1 | -1;
    top: number;
    bottom: number;
    mitigated: boolean;
  }[];
  structureBreaks: {
    index: number;
    type: 'BOS' | 'CHoCH';
    direction: 1 | -1;
    level: number;
  }[];
  euphoriaCapitulation: {
    index: number;
    type: 1 | -1;
    price: number;
    zScore: number;
  }[];
  currentPrice: number;
  candleCount: number;
}

// ── Entry Signals ────────────────────────────────────────────────────────────

export type TradeDirection = 'LONG' | 'SHORT';

export interface SmcEntrySignal {
  asset: string;
  direction: TradeDirection;
  entryPrice: number;
  /** Optimal limit entry at zone edge (may differ from market price) */
  limitPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  slPct: number;
  rrRatio: number;
  score: number;
  /** 'market' = immediate entry, 'limit' = place limit order at zone edge */
  entryType: 'market' | 'limit';
  /** Which SMC factors contributed */
  confluence: {
    bos: boolean;
    choch: boolean;
    fvgRetest: boolean;
    obRetest: boolean;
    swingAlignment: boolean;
    fvgStacking: boolean;
    mtfAgreement: boolean;
  };
  /** Raw SMC context for logging */
  smcContext: Record<string, unknown>;
  regime: MarketRegime;
  adx: number;
  maxHoldHours: number;
}

// ── Positions & Trades ───────────────────────────────────────────────────────

export type PositionStatus = 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED';

export type ExitReason =
  | 'SL_HIT'
  | 'TP1_HIT'
  | 'TP2_HIT'
  | 'STRUCTURE_INVALIDATED'
  | 'TIME_EXIT'
  | 'DRAWDOWN_BREAKER'
  | 'EC_FORCE_CLOSE'
  | 'MANUAL';

export interface PaperPosition {
  id: string;
  asset: string;
  direction: TradeDirection;
  entryPrice: number;
  currentPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  /** Original full size in USD */
  sizeUsd: number;
  /** Remaining size (after partial close) */
  remainingSizeUsd: number;
  leverage: number;
  riskPct: number;
  rrRatio: number;
  /** Unrealised P&L in USD */
  unrealisedPnl: number;
  entryFeeUsd: number;
  exitFeeUsd: number;
  accruedFundingUsd: number;
  status: PositionStatus;
  /** Whether TP1 was hit (partial close done) */
  tp1Hit: boolean;
  /** Whether SL has been moved to breakeven after TP1 */
  slMovedToBreakeven: boolean;
  openedAt: string; // ISO timestamp
  closedAt?: string;
  exitReason?: ExitReason;
  realisedPnl?: number;
  lastFundingAccruedAt?: string;
  regime?: MarketRegime;
  smcContext: Record<string, unknown>;
}

// ── Account State ────────────────────────────────────────────────────────────

export interface PaperAccountState {
  equity: number;
  peakEquity: number;
  drawdownPct: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  totalPnlUsd: number;
  totalFeesUsd: number;
  totalFundingUsd: number;
  dailyPnlUsd: number;
  dailyPnlDate: string; // YYYY-MM-DD
  isHalted: boolean;
  haltedAt?: string;
  haltReason?: string;
}

export interface PendingLimitOrder {
  id: string;
  asset: string;
  direction: TradeDirection;
  limitPrice: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  sizeUsd: number;
  leverage: number;
  riskPct: number;
  rrRatio: number;
  score: number;
  createdAt: string;
  /** Auto-cancel after this many hours */
  expiresAfterHours: number;
  smcContext: Record<string, unknown>;
}

export interface PaperTradingState {
  account: PaperAccountState;
  openPositions: PaperPosition[];
  pendingOrders: PendingLimitOrder[];
  recentTrades: PaperPosition[]; // last 100 closed trades
  /** Tracks last SL time per asset for re-entry cooldown */
  lastSlByAsset: Record<string, string>; // asset → ISO timestamp
  lastCycleDiagnostics?: CycleDiagnostics;
  lastCycleAt?: string;
}
