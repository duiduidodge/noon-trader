import type { PrismaClient } from '@prisma/client';
import { loadState } from '@noon-trader/trading';
import type { PaperPosition } from '@noon-trader/trading';

type HubSeverity = 'INFO' | 'WARN' | 'ERROR';
type HubStatus = 'RUNNING' | 'HEALTHY' | 'DEGRADED' | 'HALTED' | 'ERROR';

interface HubRegisterPayload {
  slug: string;
  name: string;
  environment: string;
  category?: string;
  strategyFamily?: string;
  venue?: string;
  repoUrl?: string;
  dashboardUrl?: string;
  status?: HubStatus;
}

interface HubHeartbeatPayload {
  botSlug: string;
  name: string;
  status: HubStatus;
  message: string;
  version: string;
  uptimeSec: number;
  observedAt: string;
}

interface HubMetricsPayload {
  botSlug: string;
  name: string;
  equityUsd: number;
  cashUsd: number;
  dailyPnlUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  drawdownPct: number;
  winRatePct: number;
  openPositions: number;
  observedAt: string;
}

interface HubPositionPayload {
  botSlug: string;
  name: string;
  snapshotTime: string;
  positions: Array<{
    symbol: string;
    side: 'LONG' | 'SHORT';
    status: string;
    quantity: number;
    entryPrice: number;
    markPrice: number;
    pnlUsd: number;
    pnlPct: number;
    openedAt?: string;
  }>;
}

interface HubEventPayload {
  botSlug: string;
  name: string;
  eventType: string;
  severity: HubSeverity;
  title: string;
  body?: string;
  symbol?: string;
  eventAt: string;
}

function env(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function calculateCashUsd(
  equityUsd: number,
  positions: PaperPosition[],
): number {
  const usedMarginUsd = positions.reduce((sum, position) => {
    const leverage = Math.max(1, position.leverage || 1);
    return sum + position.remainingSizeUsd / leverage;
  }, 0);

  return Math.max(0, equityUsd - usedMarginUsd);
}

function mapPosition(position: PaperPosition) {
  const quantity = position.currentPrice > 0
    ? position.remainingSizeUsd / position.currentPrice
    : 0;
  const pnlBase = position.remainingSizeUsd || position.sizeUsd || 0;
  const pnlPct = pnlBase > 0 ? (position.unrealisedPnl / pnlBase) * 100 : 0;

  return {
    symbol: position.asset,
    side: position.direction,
    status: position.status,
    quantity,
    entryPrice: position.entryPrice,
    markPrice: position.currentPrice,
    pnlUsd: position.unrealisedPnl,
    pnlPct,
    openedAt: position.openedAt,
  };
}

export class NoonHubClient {
  private readonly baseUrl = env('NOON_HUB_URL');
  private readonly ingestKey = env('NOON_HUB_INGEST_KEY');
  private readonly slug = env('NOON_HUB_BOT_SLUG', 'noon-trader');
  private readonly name = env('NOON_HUB_BOT_NAME', 'Noon Trader');
  private readonly environment = env('NOON_HUB_BOT_ENVIRONMENT', env('NODE_ENV', 'production'));
  private readonly category = env('NOON_HUB_BOT_CATEGORY', 'trading');
  private readonly strategyFamily = env('NOON_HUB_BOT_STRATEGY_FAMILY', 'smc');
  private readonly venue = env('NOON_HUB_BOT_VENUE', 'hyperliquid');
  private readonly repoUrl = env('NOON_HUB_BOT_REPO_URL');
  private readonly dashboardUrl = env('NOON_HUB_BOT_DASHBOARD_URL');
  private readonly version = env('NOON_HUB_BOT_VERSION', '1.0.0');
  private readonly initialEquity = Number(env('PAPER_TRADING_INITIAL_EQUITY', '10000'));
  private readonly startedAt = Date.now();
  private registered = false;
  private lastHalted = false;

  isEnabled(): boolean {
    return Boolean(this.baseUrl && this.ingestKey);
  }

  private async post(path: string, payload: unknown): Promise<void> {
    if (!this.isEnabled()) return;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-noon-hub-key': this.ingestKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Noon Hub request failed: ${response.status} ${await response.text()}`);
    }
  }

  async ensureRegistered(status: HubStatus = 'RUNNING'): Promise<void> {
    if (this.registered || !this.isEnabled()) return;

    const payload: HubRegisterPayload = {
      slug: this.slug,
      name: this.name,
      environment: this.environment,
      category: this.category || undefined,
      strategyFamily: this.strategyFamily || undefined,
      venue: this.venue || undefined,
      repoUrl: this.repoUrl || undefined,
      dashboardUrl: this.dashboardUrl || undefined,
      status,
    };

    await this.post('/hub/bots/register', payload);
    this.registered = true;
  }

  async sendHeartbeat(status: HubStatus, message: string): Promise<void> {
    if (!this.isEnabled()) return;
    await this.ensureRegistered(status);

    const payload: HubHeartbeatPayload = {
      botSlug: this.slug,
      name: this.name,
      status,
      message,
      version: this.version,
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      observedAt: nowIso(),
    };

    await this.post('/hub/heartbeat', payload);
  }

  async sendEvent(
    severity: HubSeverity,
    title: string,
    body?: string,
    eventType = 'worker',
    symbol?: string,
  ): Promise<void> {
    if (!this.isEnabled()) return;
    await this.ensureRegistered(severity === 'ERROR' ? 'ERROR' : 'RUNNING');

    const payload: HubEventPayload = {
      botSlug: this.slug,
      name: this.name,
      eventType,
      severity,
      title,
      body,
      symbol,
      eventAt: nowIso(),
    };

    await this.post('/hub/events', payload);
  }

  async publishPaperState(prisma: PrismaClient): Promise<void> {
    if (!this.isEnabled()) return;
    await this.ensureRegistered('RUNNING');

    const state = await loadState(this.initialEquity, prisma);
    const unrealizedPnlUsd = state.openPositions.reduce((sum, position) => sum + position.unrealisedPnl, 0);
    const winRatePct = state.account.totalTrades > 0
      ? (state.account.winCount / state.account.totalTrades) * 100
      : 0;
    const cashUsd = calculateCashUsd(state.account.equity, state.openPositions);
    const observedAt = nowIso();

    const metricsPayload: HubMetricsPayload = {
      botSlug: this.slug,
      name: this.name,
      equityUsd: state.account.equity,
      cashUsd,
      dailyPnlUsd: state.account.dailyPnlUsd,
      realizedPnlUsd: state.account.totalPnlUsd,
      unrealizedPnlUsd,
      drawdownPct: state.account.drawdownPct,
      winRatePct,
      openPositions: state.openPositions.length,
      observedAt,
    };

    await this.post('/hub/metrics', metricsPayload);

    const positionsPayload: HubPositionPayload = {
      botSlug: this.slug,
      name: this.name,
      snapshotTime: observedAt,
      positions: state.openPositions.map(mapPosition),
    };

    if (positionsPayload.positions.length > 0) {
      await this.post('/hub/positions', positionsPayload);
    }

    if (state.account.isHalted && !this.lastHalted) {
      await this.sendEvent(
        'WARN',
        'Paper trading halted',
        state.account.haltReason || 'Paper trading account is halted.',
        'risk',
      );
    }

    this.lastHalted = state.account.isHalted;
  }
}
