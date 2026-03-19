/**
 * Monte Carlo threshold perturbation.
 * Runs N walk-forward simulations with randomly perturbed thresholds.
 * Reports stability of Sharpe ratio and max drawdown.
 */

import type { Kline } from './data-fetcher.js';
import { runWalkForward, type WalkForwardConfig } from './replay-engine.js';
import { computeMetrics } from './metrics.js';
import { DEFAULT_THRESHOLDS } from '@noon-trader/trading';

export interface MonteCarloConfig {
  iterations: number;      // default 100
  perturbPct: number;      // ±% to perturb each threshold (default 15)
  walkForward: Omit<WalkForwardConfig, 'thresholdOverride'>;
}

export interface IterationResult {
  iteration: number;
  thresholds: {
    rsiLow: number;
    rsiHigh: number;
    volSpikeRatio: number;
  };
  sharpe: number;
  maxDrawdown: number;
  totalTrades: number;
  winRate: number;
  profitFactor: number;
}

export interface MonteCarloReport {
  iterations: number;
  perturbPct: number;
  sharpe: { mean: number; std: number; min: number; max: number; cv: number };
  maxDrawdown: { mean: number; std: number; min: number; max: number };
  winRate: { mean: number; std: number };
  totalTrades: { mean: number; std: number };
  stable: boolean;  // true if std(Sharpe)/mean(Sharpe) < 0.3
  results: IterationResult[];
}

function randomPerturb(value: number, pct: number): number {
  const factor = 1 + (Math.random() * 2 - 1) * (pct / 100);
  return value * factor;
}

function stats(values: number[]): { mean: number; std: number; min: number; max: number } {
  if (values.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return {
    mean: Math.round(mean * 1000) / 1000,
    std: Math.round(Math.sqrt(variance) * 1000) / 1000,
    min: Math.round(Math.min(...values) * 1000) / 1000,
    max: Math.round(Math.max(...values) * 1000) / 1000,
  };
}

export function runMonteCarlo(
  klineData: Map<string, Map<string, Kline[]>>,
  config: MonteCarloConfig,
): MonteCarloReport {
  const { iterations = 100, perturbPct = 15, walkForward } = config;
  const results: IterationResult[] = [];

  const base = DEFAULT_THRESHOLDS;

  console.log(`\nMonte Carlo: ${iterations} iterations, ±${perturbPct}% threshold perturbation`);
  console.log(`Symbols: ${walkForward.symbols.join(', ')}\n`);

  for (let i = 0; i < iterations; i++) {
    const perturbed = {
      rsiLow:       Math.min(40, Math.max(10, randomPerturb(base.rsiLow, perturbPct))),
      rsiHigh:      Math.max(60, Math.min(95, randomPerturb(base.rsiHigh, perturbPct))),
      volSpikeRatio: Math.max(1.2, randomPerturb(base.volSpikeRatio, perturbPct)),
    };

    process.stdout.write(`  Iteration ${i + 1}/${iterations} (rsiLow=${perturbed.rsiLow.toFixed(1)}, rsiHigh=${perturbed.rsiHigh.toFixed(1)}, volSpike=${perturbed.volSpikeRatio.toFixed(2)})...`);

    try {
      const trades = runWalkForward(klineData, {
        ...walkForward,
        thresholdOverride: perturbed,
      });

      const report = computeMetrics(trades);

      const result: IterationResult = {
        iteration: i + 1,
        thresholds: perturbed,
        sharpe: report.sharpeRatio,
        maxDrawdown: report.maxDrawdownPct,
        totalTrades: report.totalTrades,
        winRate: report.winRate,
        profitFactor: report.profitFactor,
      };
      results.push(result);

      process.stdout.write(` Sharpe=${report.sharpeRatio.toFixed(2)}, DD=${report.maxDrawdownPct.toFixed(1)}%, Trades=${report.totalTrades}\n`);
    } catch (err) {
      process.stdout.write(` ERROR: ${err}\n`);
    }
  }

  const sharpeStats    = stats(results.map(r => r.sharpe));
  const drawdownStats  = stats(results.map(r => r.maxDrawdown));
  const winRateStats   = stats(results.map(r => r.winRate));
  const tradeStats     = stats(results.map(r => r.totalTrades));

  const cv = sharpeStats.mean !== 0 ? Math.abs(sharpeStats.std / sharpeStats.mean) : Infinity;
  const stable = cv < 0.3;

  const report: MonteCarloReport = {
    iterations,
    perturbPct,
    sharpe: { ...sharpeStats, cv: Math.round(cv * 1000) / 1000 },
    maxDrawdown: { mean: drawdownStats.mean, std: drawdownStats.std, min: drawdownStats.min, max: drawdownStats.max },
    winRate: { mean: winRateStats.mean, std: winRateStats.std },
    totalTrades: { mean: tradeStats.mean, std: tradeStats.std },
    stable,
    results,
  };

  console.log('\n=== Monte Carlo Summary ===');
  console.log(`Sharpe:      mean=${report.sharpe.mean}  std=${report.sharpe.std}  min=${report.sharpe.min}  max=${report.sharpe.max}  CV=${report.sharpe.cv}`);
  console.log(`Max Drawdown: mean=${report.maxDrawdown.mean}%  std=${report.maxDrawdown.std}%  min=${report.maxDrawdown.min}%  max=${report.maxDrawdown.max}%`);
  console.log(`Win Rate:    mean=${report.winRate.mean}%  std=${report.winRate.std}%`);
  console.log(`Total Trades: mean=${report.totalTrades.mean}  std=${report.totalTrades.std}`);
  console.log(`Threshold stability: ${stable ? '✓ STABLE (CV < 0.3)' : '✗ OVERFITTED (CV ≥ 0.3) — consider wider threshold tolerances'}`);

  return report;
}
