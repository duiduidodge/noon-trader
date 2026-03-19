import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { Prisma, type PrismaClient } from '@prisma/client';

const logger = console;
const exec = promisify(execCb);

interface RawEmergingAlert {
  signal?: string;
  direction?: string;
  currentRank?: number;
  contribution?: number;
  contribVelocity?: number;
  traders?: number;
  priceChg4h?: number;
  reasonCount?: number;
  reasons?: unknown;
  rankHistory?: unknown;
  contribHistory?: unknown;
  isImmediate?: boolean;
  isDeepClimber?: boolean;
  erratic?: boolean;
  lowVelocity?: boolean;
}

interface RawEmergingPayload {
  status?: string;
  time?: string;
  totalMarkets?: number;
  scansInHistory?: number;
  hasImmediate?: boolean;
  hasEmergingMover?: boolean;
  hasDeepClimber?: boolean;
  top5?: unknown;
  alerts?: RawEmergingAlert[];
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in command output');
  }
  return text.slice(start, end + 1);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNullableJsonInput(
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export interface EmergingAlertResult {
  signal: string;
  direction: string | null;
  currentRank: number | null;
  contribution: number | null;
  contribVelocity: number | null;
  priceChg4h: number | null;
  reasons: string[];
  isImmediate: boolean;
  isDeepClimber: boolean;
}

export class EmergingMoversSignalsService {
  private readonly enabled: boolean;
  private readonly command?: string;

  constructor(opts: { enabled: boolean; command?: string }) {
    this.enabled = opts.enabled;
    this.command = opts.command?.trim();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async pollAndPersist(prisma: PrismaClient): Promise<EmergingAlertResult[]> {
    if (!this.enabled) return [];

    if (!this.command) {
      logger.warn('ENABLE_EMERGING_MOVERS_SIGNALS=true but EMERGING_MOVERS_COMMAND is empty');
      return [];
    }

    const startedAt = Date.now();

    const { stdout, stderr } = await exec(this.command, {
      timeout: 45_000,
      maxBuffer: 2 * 1024 * 1024,
      shell: '/bin/bash',
      env: process.env,
    });

    const combinedOutput = `${stdout || ''}\n${stderr || ''}`.trim();
    if (!combinedOutput) {
      throw new Error('Emerging movers command returned empty output');
    }

    const payload = JSON.parse(extractJsonObject(combinedOutput)) as RawEmergingPayload;
    const signalTime = payload.time ? new Date(payload.time) : new Date();

    if (Number.isNaN(signalTime.getTime())) {
      throw new Error(`Invalid signal timestamp: ${payload.time}`);
    }

    const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];

    await prisma.$transaction(async (tx) => {
      const snapshot = await tx.emergingMoverSnapshot.create({
        data: {
          status: payload.status || 'ok',
          signalTime,
          totalMarkets: payload.totalMarkets ?? null,
          scansInHistory: payload.scansInHistory ?? null,
          hasImmediate: Boolean(payload.hasImmediate),
          hasEmergingMover: Boolean(payload.hasEmergingMover),
          hasDeepClimber: Boolean(payload.hasDeepClimber),
          top5: toNullableJsonInput(payload.top5),
          rawPayload: payload as Prisma.InputJsonValue,
        },
      });

      if (alerts.length > 0) {
        await tx.emergingMoverAlert.createMany({
          data: alerts.map((alert) => ({
            snapshotId: snapshot.id,
            signal: alert.signal || 'UNKNOWN',
            direction: alert.direction || null,
            currentRank: alert.currentRank ?? null,
            contribution: toNumber(alert.contribution),
            contribVelocity: toNumber(alert.contribVelocity),
            traders: alert.traders ?? null,
            priceChg4h: toNumber(alert.priceChg4h),
            reasonCount: alert.reasonCount ?? toStringArray(alert.reasons).length,
            reasons: toStringArray(alert.reasons),
            rankHistory: toNullableJsonInput(alert.rankHistory),
            contribHistory: toNullableJsonInput(alert.contribHistory),
            isImmediate: Boolean(alert.isImmediate),
            isDeepClimber: Boolean(alert.isDeepClimber),
            erratic: Boolean(alert.erratic),
            lowVelocity: Boolean(alert.lowVelocity),
          })),
        });
      }

      // Keep only most recent 300 snapshots (cascades alerts via FK)
      const staleSnapshots = await tx.emergingMoverSnapshot.findMany({
        orderBy: { createdAt: 'desc' },
        skip: 300,
        select: { id: true },
      });

      if (staleSnapshots.length > 0) {
        await tx.emergingMoverSnapshot.deleteMany({
          where: { id: { in: staleSnapshots.map((row) => row.id) } },
        });
      }
    });

    logger.info(
      {
        alerts: alerts.length,
        hasImmediate: Boolean(payload.hasImmediate),
        elapsedMs: Date.now() - startedAt,
      },
      'Stored emerging movers snapshot'
    );

    return alerts.map((alert) => ({
      signal: alert.signal || 'UNKNOWN',
      direction: alert.direction || null,
      currentRank: alert.currentRank ?? null,
      contribution: toNumber(alert.contribution),
      contribVelocity: toNumber(alert.contribVelocity),
      priceChg4h: toNumber(alert.priceChg4h),
      reasons: toStringArray(alert.reasons),
      isImmediate: Boolean(alert.isImmediate),
      isDeepClimber: Boolean(alert.isDeepClimber),
    }));
  }
}
