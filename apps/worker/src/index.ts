import { PrismaClient } from '@prisma/client';
import {
  getPaperTradingIntervalMs,
  isPaperTradingEnabled,
  runPaperTradingCycle,
} from '@noon-trader/trading';
import { EmergingMoversSignalsService } from './services/emerging-movers-signals.js';
import { NoonHubClient } from './services/noon-hub.js';
import { OpportunitySignalsService } from './services/opportunity-signals.js';
import { WhaleSignalsService } from './services/whale-signals.js';

const prisma = new PrismaClient();
const noonHub = new NoonHubClient();
const opportunitySignalsService = new OpportunitySignalsService({
  enabled: process.env.ENABLE_OPPORTUNITY_SIGNALS === 'true',
});
const emergingMoversSignalsService = new EmergingMoversSignalsService({
  enabled: process.env.ENABLE_EMERGING_MOVERS_SIGNALS === 'true',
  command: process.env.EMERGING_MOVERS_COMMAND,
});
const whaleSignalsService = new WhaleSignalsService({
  enabled: process.env.ENABLE_WHALE_SIGNALS === 'true',
  riskProfile: (
    process.env.WHALE_RISK_PROFILE === 'conservative' ||
    process.env.WHALE_RISK_PROFILE === 'aggressive'
  ) ? process.env.WHALE_RISK_PROFILE : 'moderate',
});

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function intervalFromEnv(key: string, fallbackSeconds: number): number {
  return Number(process.env[key] ?? fallbackSeconds.toString()) * 1000;
}

async function runIfDue(params: {
  label: string;
  enabled: boolean;
  intervalMs: number;
  lastRunAt: number;
  runner: () => Promise<void>;
}): Promise<number> {
  const { label, enabled, intervalMs, lastRunAt, runner } = params;
  if (!enabled) return lastRunAt;
  const now = Date.now();
  if (now - lastRunAt < intervalMs) return lastRunAt;

  try {
    await runner();
    console.log(`[trader-worker] ${label} cycle completed`);
  } catch (error) {
    console.error(`[trader-worker] ${label} cycle failed`, error);
  }
  return now;
}

async function main(): Promise<void> {
  const paperEnabled = isPaperTradingEnabled();
  const oppEnabled = opportunitySignalsService.isEnabled();
  const emergingEnabled = emergingMoversSignalsService.isEnabled();
  const whaleEnabled = whaleSignalsService.isEnabled();

  if (!paperEnabled && !oppEnabled && !emergingEnabled && !whaleEnabled) {
    console.log('[trader-worker] no trading jobs enabled; worker exiting');
    return;
  }

  const paperIntervalMs = getPaperTradingIntervalMs();
  const oppIntervalMs = intervalFromEnv('OPPORTUNITY_SIGNALS_INTERVAL_SECONDS', 300);
  const emergingIntervalMs = intervalFromEnv('EMERGING_MOVERS_INTERVAL_SECONDS', 60);
  const whaleIntervalMs = intervalFromEnv('WHALE_SIGNALS_INTERVAL_SECONDS', 1800);
  let lastPaperRunAt = 0;
  let lastOppRunAt = 0;
  let lastEmergingRunAt = 0;
  let lastWhaleRunAt = 0;

  console.log('[trader-worker] starting standalone trading worker');
  if (noonHub.isEnabled()) {
    try {
      await noonHub.ensureRegistered('RUNNING');
      await noonHub.sendEvent('INFO', 'Worker started', 'Noon Trader worker boot completed.', 'lifecycle');
    } catch (error) {
      console.error('[trader-worker] noon hub startup sync failed', error);
    }
  }

  for (;;) {
    lastPaperRunAt = await runIfDue({
      label: 'paper',
      enabled: paperEnabled,
      intervalMs: paperIntervalMs,
      lastRunAt: lastPaperRunAt,
      runner: async () => {
        await runPaperTradingCycle(prisma);
        await noonHub.publishPaperState(prisma);
      },
    });
    lastOppRunAt = await runIfDue({
      label: 'opportunity-signals',
      enabled: oppEnabled,
      intervalMs: oppIntervalMs,
      lastRunAt: lastOppRunAt,
      runner: async () => {
        await opportunitySignalsService.pollAndPersist(prisma);
      },
    });
    lastEmergingRunAt = await runIfDue({
      label: 'emerging-movers',
      enabled: emergingEnabled,
      intervalMs: emergingIntervalMs,
      lastRunAt: lastEmergingRunAt,
      runner: async () => {
        await emergingMoversSignalsService.pollAndPersist(prisma);
      },
    });
    lastWhaleRunAt = await runIfDue({
      label: 'whale-signals',
      enabled: whaleEnabled,
      intervalMs: whaleIntervalMs,
      lastRunAt: lastWhaleRunAt,
      runner: async () => {
        await whaleSignalsService.pollAndPersist(prisma);
      },
    });
    if (noonHub.isEnabled()) {
      const openJobs = [
        paperEnabled ? 'paper' : null,
        oppEnabled ? 'opportunity' : null,
        emergingEnabled ? 'emerging' : null,
        whaleEnabled ? 'whale' : null,
      ].filter(Boolean).join(', ');
      try {
        await noonHub.sendHeartbeat('RUNNING', `Worker loop active: ${openJobs || 'idle'}`);
      } catch (error) {
        console.error('[trader-worker] noon hub heartbeat failed', error);
      }
    }
    await sleep(15_000);
  }
}

main().catch((error) => {
  console.error('[trader-worker] fatal startup error', error);
  if (noonHub.isEnabled()) {
    void noonHub.sendEvent(
      'ERROR',
      'Worker crashed',
      error instanceof Error ? error.message : String(error),
      'crash',
    );
  }
  process.exit(1);
});
