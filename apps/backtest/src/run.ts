/**
 * CLI entry point for the backtesting framework.
 *
 * Usage:
 *   npx tsx src/run.ts [options]
 *
 * Options:
 *   --start <YYYY-MM-DD>      Start date (default: 2023-01-01)
 *   --end <YYYY-MM-DD>        End date (default: today)
 *   --symbols <S1,S2,...>     Comma-separated symbols (default: BTC,ETH,SOL,BNB,XRP)
 *   --train-days <N>          Training window days (default: 180)
 *   --test-days <N>           Test window days (default: 30)
 *   --step-days <N>           Step between windows days (default: 30)
 *   --mc-iterations <N>       Monte Carlo iterations (default: 100)
 *   --mc-perturb <N>          Threshold perturbation % (default: 15)
 *   --no-monte-carlo          Skip Monte Carlo simulation
 *   --force-refresh           Re-download klines even if cached
 *   --out <path>              Output report path (default: results/report.json)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchAllSymbols } from './data-fetcher.js';
import { runWalkForward } from './replay-engine.js';
import { runMonteCarlo } from './monte-carlo.js';
import { computeMetrics } from './metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, '..', 'results');

// Symbol shorthand → Binance futures symbol
function expandSymbol(s: string): string {
  const upper = s.toUpperCase();
  return upper.endsWith('USDT') ? upper : `${upper}USDT`;
}

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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const startDate   = args['start']           ?? '2023-01-01';
  const endDate     = args['end']             ?? new Date().toISOString().slice(0, 10);
  const rawSymbols  = args['symbols']         ?? 'BTC,ETH,SOL,BNB,XRP';
  const trainDays   = parseInt(args['train-days']      ?? '180', 10);
  const testDays    = parseInt(args['test-days']       ?? '30', 10);
  const stepDays    = parseInt(args['step-days']       ?? '30', 10);
  const mcIterations= parseInt(args['mc-iterations']   ?? '100', 10);
  const mcPerturb   = parseInt(args['mc-perturb']      ?? '15', 10);
  const skipMC      = args['no-monte-carlo'] === 'true';
  const forceRefresh= args['force-refresh'] === 'true';
  const outPath     = args['out'] ?? path.join(RESULTS_DIR, 'report.json');

  const symbols = rawSymbols.split(',').map(s => expandSymbol(s.trim()));

  console.log('=== Crypto Signal Backtest ===');
  console.log(`Period:  ${startDate} → ${endDate}`);
  console.log(`Symbols: ${symbols.join(', ')}`);
  console.log(`Windows: train=${trainDays}d / test=${testDays}d / step=${stepDays}d`);
  if (!skipMC) console.log(`Monte Carlo: ${mcIterations} iterations ±${mcPerturb}%`);
  console.log('');

  // Step 1: Fetch historical data
  console.log('Step 1: Fetching historical klines...');
  const klineData = await fetchAllSymbols(symbols, ['1h', '4h'], startDate, endDate, forceRefresh);

  // Step 2: Walk-forward backtest
  console.log('\nStep 2: Walk-forward simulation...');
  const wfConfig = { symbols, trainDays, testDays, stepDays };
  const trades = runWalkForward(klineData, wfConfig);

  console.log(`\nTotal trades simulated: ${trades.length}`);

  const mainReport = computeMetrics(trades);

  console.log('\n=== Walk-Forward Results ===');
  console.log(`Total Trades:  ${mainReport.totalTrades}`);
  console.log(`Win Rate:      ${mainReport.winRate}%`);
  console.log(`Profit Factor: ${mainReport.profitFactor}`);
  console.log(`Sharpe Ratio:  ${mainReport.sharpeRatio}`);
  console.log(`Max Drawdown:  ${mainReport.maxDrawdownPct}%`);
  console.log(`Avg Hold:      ${mainReport.avgHoldHours}h`);
  console.log(`Avg R:         ${mainReport.avgRMultiple}R`);
  console.log(`Total R:       ${mainReport.totalRMultiple}R`);

  if (mainReport.byRegime && Object.keys(mainReport.byRegime).length > 0) {
    console.log('\nBy Regime:');
    for (const [regime, stats] of Object.entries(mainReport.byRegime)) {
      console.log(`  ${regime.padEnd(10)} trades=${stats.trades}  WR=${(stats.winRate * 100).toFixed(1)}%  avgR=${stats.avgRMultiple.toFixed(2)}`);
    }
  }

  if (mainReport.byDirection && Object.keys(mainReport.byDirection).length > 0) {
    console.log('\nBy Direction:');
    for (const [dir, stats] of Object.entries(mainReport.byDirection)) {
      console.log(`  ${dir.padEnd(6)} trades=${stats.trades}  WR=${(stats.winRate * 100).toFixed(1)}%  avgR=${stats.avgRMultiple.toFixed(2)}`);
    }
  }

  // Step 3: Monte Carlo
  let mcReport = null;
  if (!skipMC && trades.length > 0) {
    console.log('\nStep 3: Monte Carlo threshold sensitivity analysis...');
    mcReport = runMonteCarlo(klineData, {
      iterations: mcIterations,
      perturbPct: mcPerturb,
      walkForward: wfConfig,
    });
  } else if (skipMC) {
    console.log('\nStep 3: Monte Carlo skipped (--no-monte-carlo).');
  } else {
    console.log('\nStep 3: Monte Carlo skipped (no trades to analyze).');
  }

  // Step 4: Write output
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      startDate,
      endDate,
      symbols,
      trainDays,
      testDays,
      stepDays,
    },
    walkForward: {
      report: mainReport,
      trades,
    },
    monteCarlo: mcReport,
  };

  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nReport written to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
