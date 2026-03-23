/**
 * Paper Trading System — Main Orchestrator
 *
 * Primary timeframe: 1H (entry signals, ADX regime filter)
 * Higher timeframe:  4H (trend bias — only trade in 4H direction)
 * Monitoring:        1H candle highs/lows for SL/TP fill simulation
 */

import type { PrismaClient } from '@prisma/client';
import type { PaperTradingConfig, PaperTradingState, SignalRejectionReason } from './types.js';
import { DEFAULT_CONFIG as DEFAULTS } from './types.js';
import { analyzeSmcSetup, evaluateEntryDecision, calculateADX } from './smc-strategy.js';
import { tryOpenPosition, monitorPositions, checkPendingOrders } from './position-manager.js';
import { checkHaltCooldown } from './risk-manager.js';
import { loadState, saveState } from './trade-state.js';
import { fetchHLAssetMap, fetchHLCandles } from '../hyperliquid-client.js';
import {
  buildTradeOpenedEmbed,
  buildTradeClosedEmbed,
  buildTp1HitEmbed,
  buildDrawdownAlertEmbed,
  sendTradeWebhook,
} from './discord-trade-poster.js';
import type { OhlcArrays } from '../smart-money-concepts.js';
import { startDashboardServer, appendLog } from './dashboard-server.js';

// ── Config from env ──────────────────────────────────────────────────────────

function loadConfig(): PaperTradingConfig {
  const assets = (process.env.PAPER_TRADING_ASSETS ?? 'BTC,ETH,SOL')
    .split(',')
    .map((s) => s.trim().toUpperCase());

  return {
    ...DEFAULTS,
    assets,
    riskPerTradePct:       Number(process.env.PAPER_TRADING_RISK_PER_TRADE          ?? DEFAULTS.riskPerTradePct),
    minRR:                 Number(process.env.PAPER_TRADING_MIN_RR                  ?? DEFAULTS.minRR),
    maxConcurrent:         Number(process.env.PAPER_TRADING_MAX_CONCURRENT          ?? DEFAULTS.maxConcurrent),
    maxDrawdownPct:        Number(process.env.PAPER_TRADING_MAX_DRAWDOWN            ?? DEFAULTS.maxDrawdownPct),
    dailyLossLimitPct:     Number(process.env.PAPER_TRADING_DAILY_LOSS_LIMIT        ?? DEFAULTS.dailyLossLimitPct),
    initialEquity:         Number(process.env.PAPER_TRADING_INITIAL_EQUITY          ?? DEFAULTS.initialEquity),
    cycleIntervalSeconds:  Number(process.env.PAPER_TRADING_INTERVAL_SECONDS        ?? DEFAULTS.cycleIntervalSeconds),
    maxHoldHours:          Number(process.env.PAPER_TRADING_MAX_HOLD_HOURS          ?? DEFAULTS.maxHoldHours),
    minAdxTrending:        Number(process.env.PAPER_TRADING_MIN_ADX                 ?? DEFAULTS.minAdxTrending),
    minEntryScore:         Number(process.env.PAPER_TRADING_MIN_ENTRY_SCORE         ?? DEFAULTS.minEntryScore),
    maxBosAgeCandles:      Number(process.env.PAPER_TRADING_MAX_BOS_AGE_CANDLES     ?? DEFAULTS.maxBosAgeCandles),
    reEntryCooldownHours:  Number(process.env.PAPER_TRADING_REENTRY_COOLDOWN_HOURS  ?? DEFAULTS.reEntryCooldownHours),
    makerFeeBps:           Number(process.env.PAPER_TRADING_MAKER_FEE_BPS           ?? DEFAULTS.makerFeeBps),
    takerFeeBps:           Number(process.env.PAPER_TRADING_TAKER_FEE_BPS           ?? DEFAULTS.takerFeeBps),
    enableHlContextFilters:
      (process.env.PAPER_TRADING_ENABLE_HL_CONTEXT_FILTERS ?? String(DEFAULTS.enableHlContextFilters)) === 'true',
    maxAdverseFundingRateHourly: Number(
      process.env.PAPER_TRADING_MAX_ADVERSE_FUNDING_HOURLY ?? DEFAULTS.maxAdverseFundingRateHourly
    ),
    minDayVolumeUsd:       Number(process.env.PAPER_TRADING_MIN_DAY_VOLUME_USD      ?? DEFAULTS.minDayVolumeUsd),
    minOpenInterestUsd:    Number(process.env.PAPER_TRADING_MIN_OPEN_INTEREST_USD   ?? DEFAULTS.minOpenInterestUsd),
    strongTrendAdx:        Number(process.env.PAPER_TRADING_STRONG_TREND_ADX        ?? DEFAULTS.strongTrendAdx),
  };
}

async function fetchKlines(
  asset: string,
  interval: string,
  limit: number,
): Promise<OhlcArrays | null> {
  try {
    if (interval !== '1h' && interval !== '4h') return null;
    const data = await fetchHLCandles(asset, interval, limit);
    if (!data || data.length === 0) return null;
    if (!Array.isArray(data) || data.length === 0) return null;
    return {
      opens:  data.map((k) => parseFloat(k.o)),
      highs:  data.map((k) => parseFloat(k.h)),
      lows:   data.map((k) => parseFloat(k.l)),
      closes: data.map((k) => parseFloat(k.c)),
      vols:   data.map((k) => parseFloat(k.v)),
    };
  } catch {
    return null;
  }
}

// ── 4H bias: returns 1 (bullish), -1 (bearish), 0 (no clear bias) ────────────

function get4hBias(ohlc4h: OhlcArrays): 1 | -1 | 0 {
  const { closes } = ohlc4h;
  const n = closes.length;
  if (n < 20) return 0;

  // Simple bias: compare last close to 20-bar EMA on 4H
  const alpha = 2 / 21;
  let ema = closes[0];
  for (let i = 1; i < n; i++) ema = closes[i] * alpha + ema * (1 - alpha);

  const price = closes[n - 1];
  if (price > ema * 1.001) return 1;
  if (price < ema * 0.999) return -1;
  return 0;
}

// ── Main Cycle ───────────────────────────────────────────────────────────────

let _state: PaperTradingState | null = null;
let _config: PaperTradingConfig | null = null;
let _wasHaltedNotified = false;
let _dashboardStarted = false;
/** Track last closed 1H candle per asset to avoid re-evaluating same candle */
const _lastCandleClose = new Map<string, number>();

function emptyRejectionCounts(): Record<SignalRejectionReason, number> {
  return {
    no_structure: 0,
    adx: 0,
    stale_bos: 0,
    ec_veto: 0,
    score: 0,
    no_sl_level: 0,
    sl_bounds: 0,
    rr: 0,
    four_hour_bias: 0,
    risk: 0,
  };
}

export async function runPaperTradingCycle(prisma?: PrismaClient): Promise<void> {
  if (!_dashboardStarted) {
    _dashboardStarted = true;
    startDashboardServer(prisma);
  }

  if (!_config) _config = loadConfig();
  if (!_state) {
    _state = await loadState(_config.initialEquity, prisma);
    if (!_state.pendingOrders) _state.pendingOrders = [];
    if (!_state.lastSlByAsset) _state.lastSlByAsset = {};
  }

  const config = _config;
  const state = _state;
  const webhookUrl = process.env.DISCORD_PAPER_TRADE_WEBHOOK ?? process.env.DISCORD_SIGNAL_WEBHOOK_URL;
  const rejectionCounts = emptyRejectionCounts();
  let assetsEvaluated = 0;
  let acceptedSignals = 0;
  let openedPositions = 0;
  let placedOrders = 0;
  const log = (msg: string) => {
    console.log(`[paper-trading] ${msg}`);
    appendLog(msg);
  };

  // Check halt cooldown
  if (state.account.isHalted) {
    if (checkHaltCooldown(state.account)) {
      log('Halt cooldown expired — resuming trading');
      state.account.isHalted = false;
      state.account.haltReason = undefined;
      state.account.haltedAt = undefined;
      _wasHaltedNotified = false;
    } else {
      if (!_wasHaltedNotified) {
        log(`Account halted: ${state.account.haltReason}`);
        _wasHaltedNotified = true;
      }
      return;
    }
  }

  // ── Fetch klines: 1H (primary) + 4H (bias) ─────────────────────────────
  const smcBy1h  = new Map<string, ReturnType<typeof analyzeSmcSetup>>();
  const smcBy4h  = new Map<string, ReturnType<typeof analyzeSmcSetup>>();
  const ohlcBy1h = new Map<string, OhlcArrays>();
  const ohlcBy4h = new Map<string, OhlcArrays>();
  const candleHighs   = new Map<string, number>();
  const candleLows    = new Map<string, number>();
  const currentPrices = new Map<string, number>();
  const hlAssetMap = await fetchHLAssetMap();

  await Promise.all(
    config.assets.map(async (asset) => {
      const [k1h, k4h] = await Promise.all([
        fetchKlines(asset, '1h', 200),
        fetchKlines(asset, '4h', 200),
      ]);

      if (k1h) {
        const smc = analyzeSmcSetup(k1h, asset, '1h', 5);
        smcBy1h.set(asset, smc);
        ohlcBy1h.set(asset, k1h);
        currentPrices.set(asset, smc.currentPrice);
        const n = k1h.highs.length;
        candleHighs.set(asset, k1h.highs[n - 1]);
        candleLows.set(asset, k1h.lows[n - 1]);
      }

      if (k4h) {
        smcBy4h.set(asset, analyzeSmcSetup(k4h, asset, '4h', 5));
        ohlcBy4h.set(asset, k4h);
      }
    }),
  );

  // ── Fill pending limit orders ────────────────────────────────────────────
  const filledOrders = checkPendingOrders(state, candleHighs, candleLows, config);
  for (const pos of filledOrders) {
    state.openPositions.push(pos);
    log(`LIMIT FILLED ${pos.direction} ${pos.asset} @ $${pos.entryPrice.toFixed(2)} SL:$${pos.slPrice.toFixed(2)} TP1:$${pos.tp1Price.toFixed(2)} R:R ${pos.rrRatio}`);
    if (webhookUrl) await sendTradeWebhook(webhookUrl, buildTradeOpenedEmbed(pos));
  }

  // ── Monitor existing positions (use 1H data) ─────────────────────────────
  const events = monitorPositions(
    state, smcBy1h, ohlcBy1h, candleHighs, candleLows, currentPrices, config,
  );

  if (webhookUrl) {
    for (const evt of events) {
      if (evt.type === 'SL_HIT' || evt.type === 'TP2_HIT' || evt.type === 'CLOSED') {
        await sendTradeWebhook(webhookUrl, buildTradeClosedEmbed(evt.position));
      } else if (evt.type === 'TP1_HIT') {
        await sendTradeWebhook(webhookUrl, buildTp1HitEmbed(evt.position, evt.pnlUsd ?? 0));
      }
    }
  }

  if (state.account.isHalted && webhookUrl && !_wasHaltedNotified) {
    await sendTradeWebhook(webhookUrl, buildDrawdownAlertEmbed(state.account));
    _wasHaltedNotified = true;
    await saveState(state, prisma);
    return;
  }

  // ── Evaluate new entries ─────────────────────────────────────────────────
  for (const asset of config.assets) {
    const smc1h  = smcBy1h.get(asset);
    const smc4h  = smcBy4h.get(asset);
    const ohlc1h = ohlcBy1h.get(asset);
    const ohlc4h = ohlcBy4h.get(asset);
    if (!smc1h || !smc4h || !ohlc1h || !ohlc4h) { log(`${asset}: kline fetch failed`); continue; }

    if (state.openPositions.some((p) => p.asset === asset)) continue;
    if (state.pendingOrders.some((o) => o.asset === asset)) continue;

    // Candle-close gate: only evaluate on a new 1H candle close
    const lastClosedCandle = ohlc1h.closes[ohlc1h.closes.length - 2];
    const prev = _lastCandleClose.get(asset);
    if (prev !== undefined && prev === lastClosedCandle) continue; // same candle, skip
    _lastCandleClose.set(asset, lastClosedCandle);
    assetsEvaluated++;

    // 4H bias filter: reject signals that go against 4H trend
    const bias4h = get4hBias(ohlc4h);

    // Evaluate entry on 1H using 4H SMC as the higher-TF confluence
    const decision = evaluateEntryDecision(smc1h, smc4h, ohlc1h, config);
    const signal = decision.signal;

    if (!signal) {
      const reason = decision.rejectionReason ?? 'score';
      rejectionCounts[reason]++;
      const { structureBreaks } = smc1h;
      const lastBreak = structureBreaks[structureBreaks.length - 1];
      const adx1h = calculateADX(ohlc1h).toFixed(1);
      const bosAge = lastBreak ? `BOS@idx${lastBreak.index}/${smc1h.candleCount}(${lastBreak.type})` : 'noBOS';
      log(`${asset}: no signal — ADX:${adx1h} ${bosAge} ${reason}`);
      continue;
    }

    acceptedSignals++;

    // 4H bias gate: skip if signal direction opposes 4H trend
    if (bias4h !== 0 && (
      (signal.direction === 'LONG'  && bias4h === -1) ||
      (signal.direction === 'SHORT' && bias4h === 1)
    )) {
      rejectionCounts.four_hour_bias++;
      log(`${asset}: ${signal.direction} blocked — opposes 4H bias (${bias4h === 1 ? 'bullish' : 'bearish'})`);
      continue;
    }

    const hlCtx = hlAssetMap?.get(asset) ?? null;
    if (hlCtx) {
      if (config.enableHlContextFilters) {
        const adverseFunding =
          (signal.direction === 'LONG' && hlCtx.funding > config.maxAdverseFundingRateHourly) ||
          (signal.direction === 'SHORT' && hlCtx.funding < -config.maxAdverseFundingRateHourly);
        if (adverseFunding) {
          log(`${asset}: ${signal.direction} blocked — adverse HL funding ${hlCtx.funding.toFixed(6)}`);
          continue;
        }
        if (hlCtx.dayVolume < config.minDayVolumeUsd) {
          log(`${asset}: blocked — HL day volume ${Math.round(hlCtx.dayVolume)} below ${config.minDayVolumeUsd}`);
          continue;
        }
        if (hlCtx.openInterest < config.minOpenInterestUsd) {
          log(`${asset}: blocked — HL open interest ${Math.round(hlCtx.openInterest)} below ${config.minOpenInterestUsd}`);
          continue;
        }
      }

      signal.smcContext = {
        ...signal.smcContext,
        hlFundingRate: hlCtx.funding,
        hlOpenInterest: hlCtx.openInterest,
        hlDayVolume: hlCtx.dayVolume,
        maxHoldHours: signal.maxHoldHours,
        regime: signal.regime,
      };
    }

    const result = tryOpenPosition(signal, state, config);
    if (result.position) {
      openedPositions++;
      state.openPositions.push(result.position);
      log(`OPENED ${result.position.direction} ${asset} @ $${result.position.entryPrice.toFixed(2)} SL:$${result.position.slPrice.toFixed(2)} TP1:$${result.position.tp1Price.toFixed(2)} R:R ${result.position.rrRatio} Score:${signal.score}`);
      if (webhookUrl) await sendTradeWebhook(webhookUrl, buildTradeOpenedEmbed(result.position));
    } else if (result.pendingOrder) {
      placedOrders++;
      state.pendingOrders.push(result.pendingOrder);
      log(`LIMIT ORDER ${result.pendingOrder.direction} ${asset} @ $${result.pendingOrder.limitPrice.toFixed(2)} SL:$${result.pendingOrder.slPrice.toFixed(2)} R:R ${result.pendingOrder.rrRatio} Score:${signal.score}`);
    } else {
      rejectionCounts.risk++;
      log(`${asset}: rejected — ${result.reason}`);
    }
  }

  state.lastCycleDiagnostics = {
    evaluatedAt: new Date().toISOString(),
    assetsEvaluated,
    acceptedSignals,
    openedPositions,
    placedOrders,
    rejectionCounts,
  };

  // ── Status log ───────────────────────────────────────────────────────────
  const openSummary = state.openPositions
    .map((p) => `${p.asset}:${p.direction}(${p.unrealisedPnl >= 0 ? '+' : ''}$${p.unrealisedPnl.toFixed(2)})`)
    .join(' ');
  const pendingSummary = state.pendingOrders
    .map((o) => `${o.asset}:${o.direction}@$${o.limitPrice.toFixed(0)}`)
    .join(' ');

  log(
    `Equity:$${state.account.equity.toFixed(2)} DD:${state.account.drawdownPct.toFixed(1)}% ` +
    `Fees:$${state.account.totalFeesUsd.toFixed(2)} Funding:$${state.account.totalFundingUsd.toFixed(2)} ` +
    `Trades:${state.account.totalTrades}(${state.account.winCount}W/${state.account.lossCount}L) ` +
    `Open:${state.openPositions.length > 0 ? openSummary : 'none'}` +
    (state.pendingOrders.length > 0 ? ` Pending:${pendingSummary}` : ''),
  );
  log(
    `Cycle diagnostics — evaluated:${assetsEvaluated} accepted:${acceptedSignals} opened:${openedPositions} ` +
    `pending:${placedOrders} rejects:${JSON.stringify(rejectionCounts)}`,
  );

  state.lastCycleAt = new Date().toISOString();
  await saveState(state, prisma);
}

// ── Exports ──────────────────────────────────────────────────────────────────

export function isPaperTradingEnabled(): boolean {
  return process.env.ENABLE_PAPER_TRADING === 'true';
}

export function getPaperTradingIntervalMs(): number {
  return loadConfig().cycleIntervalSeconds * 1000;
}
