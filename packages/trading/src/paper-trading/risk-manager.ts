/**
 * Risk Manager — Position sizing, drawdown, correlation, daily limits
 */

import type {
  PaperTradingConfig,
  PaperAccountState,
  PaperPosition,
  TradeDirection,
} from './types.js';

// ── Position Sizing ──────────────────────────────────────────────────────────

export interface PositionSizing {
  sizeUsd: number;
  leverage: number;
  dollarRisk: number;
}

export function calculatePositionSize(
  equity: number,
  entryPrice: number,
  slPrice: number,
  config: PaperTradingConfig,
): PositionSizing {
  const riskAmount = equity * (config.riskPerTradePct / 100);
  const slDistance = Math.abs(entryPrice - slPrice) / entryPrice;
  if (!Number.isFinite(slDistance) || slDistance <= 0) {
    return {
      sizeUsd: 0,
      leverage: 1,
      dollarRisk: Math.round(riskAmount * 100) / 100,
    };
  }

  // Position size = risk / SL distance (as fraction)
  let sizeUsd = riskAmount / slDistance;

  // Cap at max leverage
  const maxSizeByLeverage = equity * config.maxLeverage;
  if (sizeUsd > maxSizeByLeverage) {
    sizeUsd = maxSizeByLeverage;
  }

  // Cap at a configurable fraction of equity per position before leverage scaling.
  const maxNotional = equity * config.maxPositionEquityMultiple * config.maxLeverage;
  if (sizeUsd > maxNotional) {
    sizeUsd = maxNotional;
  }

  const leverage = Math.min(
    Math.ceil(sizeUsd / equity),
    config.maxLeverage,
  );

  return {
    sizeUsd: Math.round(sizeUsd * 100) / 100,
    leverage: Math.max(2, leverage),
    dollarRisk: Math.round(riskAmount * 100) / 100,
  };
}

// ── Trade Permission Checks ──────────────────────────────────────────────────

export interface TradePermission {
  allowed: boolean;
  reason?: string;
}

interface RiskClock {
  nowMs?: number;
  nowIso?: string;
}

function resolveClock(clock?: RiskClock): { nowMs: number; today: string; nowIso: string } {
  const nowMs = clock?.nowMs ?? Date.now();
  const nowIso = clock?.nowIso ?? new Date(nowMs).toISOString();
  return {
    nowMs,
    nowIso,
    today: nowIso.slice(0, 10),
  };
}

export function canOpenNewTrade(
  account: PaperAccountState,
  openPositions: PaperPosition[],
  asset: string,
  newRiskPct: number,
  config: PaperTradingConfig,
  clock?: RiskClock,
): TradePermission {
  const { today } = resolveClock(clock);
  // 1. Circuit breaker — halted
  if (account.isHalted) {
    return { allowed: false, reason: `Account halted: ${account.haltReason}` };
  }

  // 2. Max concurrent positions
  if (openPositions.length >= config.maxConcurrent) {
    return { allowed: false, reason: `Max concurrent positions (${config.maxConcurrent}) reached` };
  }

  // 3. Already have a position in this asset
  if (openPositions.some((p) => p.asset === asset)) {
    return { allowed: false, reason: `Already have an open position in ${asset}` };
  }

  // 4. Max portfolio risk
  const currentRisk = openPositions.reduce((sum, p) => sum + p.riskPct, 0);
  if (currentRisk + newRiskPct > config.maxPortfolioRiskPct) {
    return {
      allowed: false,
      reason: `Portfolio risk would exceed ${config.maxPortfolioRiskPct}% (current: ${currentRisk.toFixed(1)}%, new: ${newRiskPct.toFixed(1)}%)`,
    };
  }

  // 5. Daily loss limit
  if (account.dailyPnlDate === today) {
    const dailyLossPct = Math.abs(Math.min(0, account.dailyPnlUsd)) / account.equity * 100;
    if (dailyLossPct >= config.dailyLossLimitPct) {
      return { allowed: false, reason: `Daily loss limit (${config.dailyLossLimitPct}%) reached` };
    }
  }

  // 6. Drawdown check
  if (account.drawdownPct >= config.maxDrawdownPct) {
    return { allowed: false, reason: `Max drawdown (${config.maxDrawdownPct}%) reached` };
  }

  return { allowed: true };
}

// ── Correlation Guard ────────────────────────────────────────────────────────

/**
 * If BTC has a strong open position, block ETH/SOL from going the opposite direction.
 * BTC leads the market — trading against it is risky.
 */
export function checkCorrelationGuard(
  asset: string,
  direction: TradeDirection,
  openPositions: PaperPosition[],
): TradePermission {
  if (asset === 'BTC') return { allowed: true };

  const btcPosition = openPositions.find((p) => p.asset === 'BTC');
  if (!btcPosition) return { allowed: true };

  // Block if trying to go opposite direction to BTC
  if (btcPosition.direction !== direction) {
    return {
      allowed: false,
      reason: `Correlation guard: BTC is ${btcPosition.direction}, blocking ${asset} ${direction}`,
    };
  }

  return { allowed: true };
}

// ── Drawdown & Account Updates ───────────────────────────────────────────────

export function updateAccountState(
  account: PaperAccountState,
  pnlUsd: number,
  config: PaperTradingConfig,
  clock?: RiskClock,
): PaperAccountState {
  const updated = { ...account };
  const { nowIso, today } = resolveClock(clock);

  // Update equity
  updated.equity += pnlUsd;
  updated.totalPnlUsd += pnlUsd;

  // Track daily P&L
  if (updated.dailyPnlDate !== today) {
    updated.dailyPnlUsd = pnlUsd;
    updated.dailyPnlDate = today;
  } else {
    updated.dailyPnlUsd += pnlUsd;
  }

  // Win/loss count
  updated.totalTrades++;
  if (pnlUsd > 0) updated.winCount++;
  else if (pnlUsd < 0) updated.lossCount++;

  // Peak equity & drawdown
  if (updated.equity > updated.peakEquity) {
    updated.peakEquity = updated.equity;
  }
  updated.drawdownPct =
    ((updated.peakEquity - updated.equity) / updated.peakEquity) * 100;

  // Circuit breaker
  if (updated.drawdownPct >= config.maxDrawdownPct && !updated.isHalted) {
    updated.isHalted = true;
    updated.haltedAt = nowIso;
    updated.haltReason = `Drawdown hit ${updated.drawdownPct.toFixed(1)}% (limit: ${config.maxDrawdownPct}%)`;
  }

  return updated;
}

export function applyExecutionCost(
  account: PaperAccountState,
  amountUsd: number,
  kind: 'fee' | 'funding',
  clock?: RiskClock,
): PaperAccountState {
  if (!amountUsd) return account;

  const updated = { ...account };
  const { today } = resolveClock(clock);

  updated.equity -= amountUsd;
  updated.totalPnlUsd -= amountUsd;

  if (updated.dailyPnlDate !== today) {
    updated.dailyPnlUsd = -amountUsd;
    updated.dailyPnlDate = today;
  } else {
    updated.dailyPnlUsd -= amountUsd;
  }

  if (kind === 'fee') updated.totalFeesUsd += amountUsd;
  if (kind === 'funding') updated.totalFundingUsd += amountUsd;

  if (updated.equity > updated.peakEquity) {
    updated.peakEquity = updated.equity;
  }
  updated.drawdownPct =
    ((updated.peakEquity - updated.equity) / updated.peakEquity) * 100;

  return updated;
}

/**
 * Check if a halted account can be un-halted (24h cooldown).
 */
export function checkHaltCooldown(account: PaperAccountState): boolean {
  if (!account.isHalted || !account.haltedAt) return false;
  const haltTime = new Date(account.haltedAt).getTime();
  const elapsed = Date.now() - haltTime;
  return elapsed >= 24 * 60 * 60 * 1000; // 24 hours
}
