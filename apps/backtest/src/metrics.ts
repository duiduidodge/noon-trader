/**
 * Performance metrics for backtest results.
 */

import type { MarketRegime } from '@noon-trader/trading';

export interface TradeResult {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;        // % P&L on position
  riskPct: number;       // entry-to-SL distance
  rMultiple: number;     // P&L expressed in R multiples
  exitReason: 'TP1' | 'TP2' | 'SL' | 'TIME';
  regime: MarketRegime;
  finalScore: number;
}

export interface BacktestReport {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  avgHoldHours: number;
  avgRMultiple: number;
  byRegime: Record<string, { trades: number; winRate: number; avgRMultiple: number }>;
  byDirection: Record<string, { trades: number; winRate: number; avgRMultiple: number }>;
  monthlyReturns: { month: string; rMultiple: number }[];
  totalRMultiple: number;
}

export function computeMetrics(trades: TradeResult[]): BacktestReport {
  if (trades.length === 0) {
    return {
      totalTrades: 0, winRate: 0, profitFactor: 0, sharpeRatio: 0,
      maxDrawdownPct: 0, avgHoldHours: 0, avgRMultiple: 0,
      byRegime: {}, byDirection: {}, monthlyReturns: [], totalRMultiple: 0,
    };
  }

  const wins  = trades.filter(t => t.rMultiple > 0);
  const losses = trades.filter(t => t.rMultiple <= 0);
  const winRate = wins.length / trades.length;

  const grossWin  = wins.reduce((s, t) => s + t.rMultiple, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.rMultiple, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;

  const totalRMultiple = trades.reduce((s, t) => s + t.rMultiple, 0);
  const avgRMultiple = totalRMultiple / trades.length;
  const avgHoldHours = trades.reduce((s, t) => s + (t.exitTime - t.entryTime) / 3_600_000, 0) / trades.length;

  // Sharpe ratio (per-trade R multiples, annualized assuming 365*24/avgHoldHours trades/year)
  const mean = avgRMultiple;
  const variance = trades.reduce((s, t) => s + Math.pow(t.rMultiple - mean, 2), 0) / trades.length;
  const stdDev = Math.sqrt(variance);
  const tradesPerYear = (365 * 24) / Math.max(avgHoldHours, 1);
  const sharpeRatio = stdDev > 0 ? (mean * Math.sqrt(tradesPerYear)) / stdDev : 0;

  // Max drawdown on cumulative R curve
  const cumR = trades.reduce((acc, t) => {
    acc.push((acc[acc.length - 1] ?? 0) + t.rMultiple);
    return acc;
  }, [] as number[]);
  let peak = -Infinity, maxDrawdownPct = 0;
  for (const v of cumR) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }

  // By regime
  const byRegime: BacktestReport['byRegime'] = {};
  for (const regime of ['TRENDING', 'RANGING', 'VOLATILE'] as MarketRegime[]) {
    const group = trades.filter(t => t.regime === regime);
    if (group.length === 0) continue;
    byRegime[regime] = {
      trades: group.length,
      winRate: group.filter(t => t.rMultiple > 0).length / group.length,
      avgRMultiple: group.reduce((s, t) => s + t.rMultiple, 0) / group.length,
    };
  }

  // By direction
  const byDirection: BacktestReport['byDirection'] = {};
  for (const dir of ['LONG', 'SHORT']) {
    const group = trades.filter(t => t.direction === dir);
    if (group.length === 0) continue;
    byDirection[dir] = {
      trades: group.length,
      winRate: group.filter(t => t.rMultiple > 0).length / group.length,
      avgRMultiple: group.reduce((s, t) => s + t.rMultiple, 0) / group.length,
    };
  }

  // Monthly returns
  const monthMap = new Map<string, number>();
  for (const trade of trades) {
    const d = new Date(trade.entryTime);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(key, (monthMap.get(key) ?? 0) + trade.rMultiple);
  }
  const monthlyReturns = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rMultiple]) => ({ month, rMultiple }));

  return {
    totalTrades: trades.length,
    winRate: Math.round(winRate * 1000) / 10,
    profitFactor: Math.round(profitFactor * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    maxDrawdownPct: Math.round(maxDrawdownPct * 10) / 10,
    avgHoldHours: Math.round(avgHoldHours * 10) / 10,
    avgRMultiple: Math.round(avgRMultiple * 100) / 100,
    totalRMultiple: Math.round(totalRMultiple * 100) / 100,
    byRegime, byDirection, monthlyReturns,
  };
}
