import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), '..', 'backtest', 'results', 'paper-smc-hyperliquid-summary.json'),
      path.resolve(process.cwd(), 'apps', 'backtest', 'results', 'paper-smc-hyperliquid-summary.json'),
    ];
    const summaryPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
    if (!summaryPath) {
      return NextResponse.json({ generatedAt: new Date().toISOString(), reports: [] });
    }

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Failed to fetch backtests:', error);
    return NextResponse.json({ error: 'Failed to fetch backtests' }, { status: 500 });
  }
}
