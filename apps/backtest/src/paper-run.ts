import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeSmcSetup,
  evaluateEntrySignal,
} from '@noon-trader/trading';
import {
  tryOpenPosition,
  checkPendingOrders,
  monitorPositions,
} from '@noon-trader/trading';
import {
  DEFAULT_CONFIG,
  type PaperTradingConfig,
  type PaperTradingState,
  type PaperPosition,
} from '@noon-trader/trading';

type Interval = '1h' | '4h';

interface HLCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FundingPoint {
  time: number;
  fundingRate: number;
}

interface HorizonReport {
  horizonDays: number;
  generatedAt: string;
  coins: string[];
  totalTrades: number;
  winRate: number;
  grossPnlUsd: number;
  netPnlUsd: number;
  totalFeesUsd: number;
  totalFundingUsd: number;
  maxDrawdownPct: number;
  avgHoldHours: number;
  profitFactor: number;
  byAsset: Record<string, { trades: number; netPnlUsd: number; winRate: number }>;
  byDirection: Record<string, { trades: number; netPnlUsd: number; winRate: number }>;
  exitReasons: Record<string, number>;
  trades: Array<{
    asset: string;
    direction: string;
    regime: string | null;
    entryPrice: number;
    exitPrice: number;
    openedAt: string;
    closedAt: string | null;
    holdHours: number;
    exitReason: string | null;
    grossPnlUsd: number;
    netPnlUsd: number;
    entryFeeUsd: number;
    exitFeeUsd: number;
    fundingUsd: number;
  }>;
}

interface TimeWindow {
  nowMs: number;
  nowIso: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'hyperliquid');
const RESULTS_DIR = path.join(__dirname, '..', 'results');
const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const LOOKBACK_1H = 220;
const LOOKBACK_4H = 220;
const REQUEST_TIMEOUT_MS = 20_000;

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = 'true';
      }
    }
  }
  return result;
}

async function postInfo<T>(body: object): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(HL_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Hyperliquid HTTP ${res.status}`);
    }
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCandleSnapshot(
  coin: string,
  interval: Interval,
  startTime: number,
  endTime: number,
): Promise<HLCandle[]> {
  const cacheFile = path.join(DATA_DIR, `${coin}_${interval}_${startTime}_${endTime}.json`);
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as HLCandle[];
  }

  const data = await postInfo<Array<Record<string, unknown>>>({
    type: 'candleSnapshot',
    req: { coin, interval, startTime, endTime },
  });

  const candles = data.map((item) => ({
    time: Number(item.t ?? item.time ?? 0),
    open: Number(item.o ?? 0),
    high: Number(item.h ?? 0),
    low: Number(item.l ?? 0),
    close: Number(item.c ?? 0),
    volume: Number(item.v ?? 0),
  })).filter((c) => c.time > 0);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(candles));
  return candles;
}

async function fetchFundingHistory(
  coin: string,
  startTime: number,
  endTime: number,
): Promise<FundingPoint[]> {
  const cacheFile = path.join(DATA_DIR, `${coin}_funding_${startTime}_${endTime}.json`);
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as FundingPoint[];
  }

  let data: Array<Record<string, unknown>> = [];
  try {
    data = await postInfo<Array<Record<string, unknown>>>({
      type: 'fundingHistory',
      coin,
      startTime,
      endTime,
    });
  } catch {
    data = [];
  }

  const history = data.map((item) => ({
    time: Number(item.time ?? item.timestamp ?? 0),
    fundingRate: Number(item.fundingRate ?? item.funding ?? 0),
  })).filter((p) => p.time > 0);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(history));
  return history;
}

function defaultState(initialEquity: number): PaperTradingState {
  return {
    account: {
      equity: initialEquity,
      peakEquity: initialEquity,
      drawdownPct: 0,
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      totalPnlUsd: 0,
      totalFeesUsd: 0,
      totalFundingUsd: 0,
      dailyPnlUsd: 0,
      dailyPnlDate: new Date().toISOString().slice(0, 10),
      isHalted: false,
    },
    openPositions: [],
    pendingOrders: [],
    recentTrades: [],
    lastSlByAsset: {},
  };
}

function toSymbol(coin: string): string {
  return `${coin}USDT`;
}

function get4hBias(closes: number[]): 1 | -1 | 0 {
  if (closes.length < 20) return 0;
  const alpha = 2 / 21;
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) ema = closes[i] * alpha + ema * (1 - alpha);
  const price = closes[closes.length - 1];
  if (price > ema * 1.001) return 1;
  if (price < ema * 0.999) return -1;
  return 0;
}

function findFundingRate(history: FundingPoint[], time: number): number {
  let last = 0;
  for (const point of history) {
    if (point.time > time) break;
    last = point.fundingRate;
  }
  return last;
}

function buildClock(nowMs: number): TimeWindow {
  return {
    nowMs,
    nowIso: new Date(nowMs).toISOString(),
  };
}

function summarizeTrades(horizonDays: number, coins: string[], trades: PaperPosition[], state: PaperTradingState): HorizonReport {
  const byAsset: HorizonReport['byAsset'] = {};
  const byDirection: HorizonReport['byDirection'] = {};
  const exitReasons: Record<string, number> = {};
  let grossPnlUsd = 0;
  let netPnlUsd = 0;
  let totalFeesUsd = 0;
  let totalFundingUsd = 0;
  let holdSum = 0;
  let wins = 0;
  let grossWins = 0;
  let grossLosses = 0;
  const assetWins: Record<string, number> = {};
  const directionWins: Record<string, number> = {};

  const rows = trades.map((trade) => {
    const closedAt = trade.closedAt ? new Date(trade.closedAt).getTime() : new Date(trade.openedAt).getTime();
    const openedAt = new Date(trade.openedAt).getTime();
    const holdHours = Math.max(0, (closedAt - openedAt) / 3_600_000);
    const tradeNetPnlUsd = trade.realisedPnl ?? 0;
    const gross = tradeNetPnlUsd + trade.entryFeeUsd + trade.exitFeeUsd + trade.accruedFundingUsd;

    holdSum += holdHours;
    grossPnlUsd += gross;
    netPnlUsd += tradeNetPnlUsd;
    totalFeesUsd += trade.entryFeeUsd + trade.exitFeeUsd;
    totalFundingUsd += trade.accruedFundingUsd;
    if (tradeNetPnlUsd > 0) wins++;
    if (gross >= 0) grossWins += gross;
    else grossLosses += Math.abs(gross);

    byAsset[trade.asset] ??= { trades: 0, netPnlUsd: 0, winRate: 0 };
    byAsset[trade.asset].trades += 1;
    byAsset[trade.asset].netPnlUsd += tradeNetPnlUsd;
    if (tradeNetPnlUsd > 0) assetWins[trade.asset] = (assetWins[trade.asset] ?? 0) + 1;

    byDirection[trade.direction] ??= { trades: 0, netPnlUsd: 0, winRate: 0 };
    byDirection[trade.direction].trades += 1;
    byDirection[trade.direction].netPnlUsd += tradeNetPnlUsd;
    if (tradeNetPnlUsd > 0) directionWins[trade.direction] = (directionWins[trade.direction] ?? 0) + 1;

    if (trade.exitReason) exitReasons[trade.exitReason] = (exitReasons[trade.exitReason] ?? 0) + 1;

    return {
      asset: trade.asset,
      direction: trade.direction,
      regime: trade.regime ?? null,
      entryPrice: trade.entryPrice,
      exitPrice: trade.currentPrice,
      openedAt: trade.openedAt,
      closedAt: trade.closedAt ?? null,
      holdHours: Math.round(holdHours * 10) / 10,
      exitReason: trade.exitReason ?? null,
      grossPnlUsd: Math.round(gross * 100) / 100,
      netPnlUsd: Math.round(tradeNetPnlUsd * 100) / 100,
      entryFeeUsd: trade.entryFeeUsd,
      exitFeeUsd: trade.exitFeeUsd,
      fundingUsd: trade.accruedFundingUsd,
    };
  });

  for (const [asset, stats] of Object.entries(byAsset)) {
    const winsForAsset = assetWins[asset] ?? 0;
    stats.winRate = stats.trades > 0 ? Math.round((winsForAsset / stats.trades) * 1000) / 10 : 0;
  }
  for (const [direction, stats] of Object.entries(byDirection)) {
    const winsForDirection = directionWins[direction] ?? 0;
    stats.winRate = stats.trades > 0 ? Math.round((winsForDirection / stats.trades) * 1000) / 10 : 0;
  }

  return {
    horizonDays,
    generatedAt: new Date().toISOString(),
    coins,
    totalTrades: trades.length,
    winRate: trades.length > 0 ? Math.round((wins / trades.length) * 1000) / 10 : 0,
    grossPnlUsd: Math.round(grossPnlUsd * 100) / 100,
    netPnlUsd: Math.round(netPnlUsd * 100) / 100,
    totalFeesUsd: Math.round(totalFeesUsd * 100) / 100,
    totalFundingUsd: Math.round(totalFundingUsd * 100) / 100,
    maxDrawdownPct: Math.round(state.account.drawdownPct * 10) / 10,
    avgHoldHours: trades.length > 0 ? Math.round((holdSum / trades.length) * 10) / 10 : 0,
    profitFactor: grossLosses > 0 ? Math.round((grossWins / grossLosses) * 100) / 100 : grossWins > 0 ? 99 : 0,
    byAsset,
    byDirection,
    exitReasons,
    trades: rows,
  };
}

async function runHorizon(days: number, coins: string[], config: PaperTradingConfig): Promise<HorizonReport> {
  const endTime = Date.now();
  const lookbackHours = Math.max(LOOKBACK_1H, LOOKBACK_4H * 4);
  const startTime = endTime - (days * 24 + lookbackHours) * 3_600_000;
  const horizonStart = endTime - days * 24 * 3_600_000;
  const state = defaultState(config.initialEquity);

  const market = new Map<string, { candles1h: HLCandle[]; candles4h: HLCandle[]; funding: FundingPoint[] }>();
  for (const coin of coins) {
    const [candles1h, candles4h, funding] = await Promise.all([
      fetchCandleSnapshot(coin, '1h', startTime, endTime),
      fetchCandleSnapshot(coin, '4h', startTime, endTime),
      fetchFundingHistory(coin, startTime, endTime),
    ]);
    market.set(coin, { candles1h, candles4h, funding });
  }

  const timeline = [...new Set(
    coins.flatMap((coin) => (market.get(coin)?.candles1h ?? []).map((c) => c.time))
  )].filter((t) => t >= horizonStart).sort((a, b) => a - b);

  for (const time of timeline) {
    const smcBy1h = new Map<string, ReturnType<typeof analyzeSmcSetup>>();
    const ohlcBy1h = new Map<string, { opens: number[]; highs: number[]; lows: number[]; closes: number[]; vols: number[] }>();
    const candleHighs = new Map<string, number>();
    const candleLows = new Map<string, number>();
    const currentPrices = new Map<string, number>();
    const higherCloses = new Map<string, number[]>();

    for (const coin of coins) {
      const data = market.get(coin);
      if (!data) continue;
      const slice1h = data.candles1h.filter((c) => c.time <= time).slice(-LOOKBACK_1H);
      const slice4h = data.candles4h.filter((c) => c.time <= time).slice(-LOOKBACK_4H);
      const current = data.candles1h.find((c) => c.time === time);
      if (!current || slice1h.length < 60 || slice4h.length < 60) continue;

      const ohlc1h = {
        opens: slice1h.map((c) => c.open),
        highs: slice1h.map((c) => c.high),
        lows: slice1h.map((c) => c.low),
        closes: slice1h.map((c) => c.close),
        vols: slice1h.map((c) => c.volume),
      };
      smcBy1h.set(coin, analyzeSmcSetup(ohlc1h, coin, '1h', 5));
      ohlcBy1h.set(coin, ohlc1h);
      candleHighs.set(coin, current.high);
      candleLows.set(coin, current.low);
      currentPrices.set(coin, current.close);
      higherCloses.set(coin, slice4h.map((c) => c.close));
    }

    const clock = buildClock(time);
    const filled = checkPendingOrders(state, candleHighs, candleLows, config, clock);
    for (const position of filled) state.openPositions.push(position);

    const beforeRecent = state.recentTrades.length;
    monitorPositions(state, smcBy1h, ohlcBy1h, candleHighs, candleLows, currentPrices, config, clock);
    const afterRecent = state.recentTrades.length;
    if (afterRecent > beforeRecent) {
      // recent trades already stored in state
    }

    for (const coin of coins) {
      if (state.openPositions.some((p) => p.asset === coin)) continue;
      if (state.pendingOrders.some((o) => o.asset === coin)) continue;
      const data = market.get(coin);
      const ohlc1h = ohlcBy1h.get(coin);
      if (!data || !ohlc1h) continue;

      const slice4h = data.candles4h.filter((c) => c.time <= time).slice(-LOOKBACK_4H);
      if (slice4h.length < 60) continue;
      const ohlc4h = {
        opens: slice4h.map((c) => c.open),
        highs: slice4h.map((c) => c.high),
        lows: slice4h.map((c) => c.low),
        closes: slice4h.map((c) => c.close),
        vols: slice4h.map((c) => c.volume),
      };

      const smc1h = smcBy1h.get(coin);
      const smc4h = analyzeSmcSetup(ohlc4h, coin, '4h', 5);
      if (!smc1h) continue;

      const signal = evaluateEntrySignal(smc1h, smc4h, ohlc1h, config);
      if (!signal) continue;

      const bias4h = get4hBias(higherCloses.get(coin) ?? []);
      if (bias4h !== 0 && (
        (signal.direction === 'LONG' && bias4h === -1) ||
        (signal.direction === 'SHORT' && bias4h === 1)
      )) {
        continue;
      }

      const fundingRate = findFundingRate(data.funding, time);
      signal.smcContext = {
        ...signal.smcContext,
        hlFundingRate: fundingRate,
        maxHoldHours: signal.maxHoldHours,
        regime: signal.regime,
      };

      const result = tryOpenPosition(signal, state, config, clock);
      if (result.position) state.openPositions.push(result.position);
      if (result.pendingOrder) state.pendingOrders.push(result.pendingOrder);
    }
  }

  if (timeline.length > 0) {
    const finalTime = timeline[timeline.length - 1];
    for (const pos of state.openPositions) {
      const data = market.get(pos.asset);
      const close = data?.candles1h.filter((c) => c.time <= finalTime).at(-1)?.close ?? pos.currentPrice;
      const holdHours = (finalTime - new Date(pos.openedAt).getTime()) / 3_600_000;
      const feeUsd = pos.remainingSizeUsd * (config.takerFeeBps / 10_000);
      const fundingUsd = Math.max(0, pos.remainingSizeUsd * Number(pos.smcContext.hlFundingRate ?? 0) * holdHours * (pos.direction === 'LONG' ? 1 : -1));
      const gross = pos.direction === 'LONG'
        ? ((close - pos.entryPrice) / pos.entryPrice) * pos.remainingSizeUsd
        : ((pos.entryPrice - close) / pos.entryPrice) * pos.remainingSizeUsd;
      pos.exitFeeUsd += Math.round(feeUsd * 100) / 100;
      pos.accruedFundingUsd += Math.round(fundingUsd * 100) / 100;
      pos.realisedPnl = Math.round((gross - pos.exitFeeUsd - pos.accruedFundingUsd) * 100) / 100;
      pos.currentPrice = close;
      pos.closedAt = new Date(finalTime).toISOString();
      pos.exitReason = 'TIME_EXIT';
      pos.status = 'CLOSED';
      state.recentTrades.push(pos);
    }
    state.openPositions = [];
  }

  return summarizeTrades(days, coins, state.recentTrades, state);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const days = (args.days ?? '7,30,60,90').split(',').map((v) => Number(v.trim())).filter(Boolean);
  const coins = (args.coins ?? 'BTC,ETH,SOL').split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
  const out = args.out ?? RESULTS_DIR;

  const config: PaperTradingConfig = {
    ...DEFAULT_CONFIG,
    assets: coins,
    initialEquity: Number(process.env.PAPER_TRADING_INITIAL_EQUITY ?? DEFAULT_CONFIG.initialEquity),
    riskPerTradePct: Number(process.env.PAPER_TRADING_RISK_PER_TRADE ?? DEFAULT_CONFIG.riskPerTradePct),
    minRR: Number(process.env.PAPER_TRADING_MIN_RR ?? DEFAULT_CONFIG.minRR),
    maxPortfolioRiskPct: Number(process.env.PAPER_TRADING_MAX_PORTFOLIO_RISK ?? DEFAULT_CONFIG.maxPortfolioRiskPct),
    maxLeverage: Number(process.env.PAPER_TRADING_MAX_LEVERAGE ?? DEFAULT_CONFIG.maxLeverage),
    maxPositionEquityMultiple: Number(
      process.env.PAPER_TRADING_MAX_POSITION_EQUITY_MULTIPLE ?? DEFAULT_CONFIG.maxPositionEquityMultiple
    ),
    minSlPct: Number(process.env.PAPER_TRADING_MIN_SL_PCT ?? DEFAULT_CONFIG.minSlPct),
    maxSlPct: Number(process.env.PAPER_TRADING_MAX_SL_PCT ?? DEFAULT_CONFIG.maxSlPct),
    slippagePct: Number(process.env.PAPER_TRADING_SLIPPAGE_PCT ?? DEFAULT_CONFIG.slippagePct),
    maxHoldHours: Number(process.env.PAPER_TRADING_MAX_HOLD_HOURS ?? DEFAULT_CONFIG.maxHoldHours),
    minAdxTrending: Number(process.env.PAPER_TRADING_MIN_ADX ?? DEFAULT_CONFIG.minAdxTrending),
    minEntryScore: Number(process.env.PAPER_TRADING_MIN_ENTRY_SCORE ?? DEFAULT_CONFIG.minEntryScore),
    reEntryCooldownHours: Number(process.env.PAPER_TRADING_REENTRY_COOLDOWN_HOURS ?? DEFAULT_CONFIG.reEntryCooldownHours),
    makerFeeBps: Number(process.env.PAPER_TRADING_MAKER_FEE_BPS ?? DEFAULT_CONFIG.makerFeeBps),
    takerFeeBps: Number(process.env.PAPER_TRADING_TAKER_FEE_BPS ?? DEFAULT_CONFIG.takerFeeBps),
  };

  fs.mkdirSync(out, { recursive: true });
  const reports: HorizonReport[] = [];
  for (const dayCount of days) {
    console.log(`Running paper SMC backtest for ${dayCount}d on ${coins.join(', ')}`);
    const report = await runHorizon(dayCount, coins, config);
    reports.push(report);
    fs.writeFileSync(
      path.join(out, `paper-smc-hyperliquid-${dayCount}d.json`),
      JSON.stringify(report, null, 2),
    );
  }

  fs.writeFileSync(
    path.join(out, 'paper-smc-hyperliquid-summary.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
