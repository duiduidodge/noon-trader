import { Prisma, type PrismaClient } from '@prisma/client';
import { runOpportunityScan, type OpportunityResult, type OpportunityScanResult } from '@noon-trader/trading';

const logger = console;

function toNullableJsonInput(
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export class OpportunitySignalsService {
  private readonly enabled: boolean;

  constructor(opts: { enabled: boolean; command?: string }) {
    this.enabled = opts.enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async pollAndPersist(prisma: PrismaClient): Promise<{ opportunities: OpportunityResult[]; btcContext: OpportunityScanResult['btcContext'] | null }> {
    if (!this.enabled) return { opportunities: [], btcContext: null };

    const startedAt = Date.now();

    const payload = await runOpportunityScan();

    const scanTime = new Date(payload.scanTime);
    if (isNaN(scanTime.getTime())) {
      throw new Error(`Invalid scan timestamp: ${payload.scanTime}`);
    }

    const opportunities = Array.isArray(payload.opportunities)
      ? payload.opportunities.filter((item) => typeof item.asset === 'string' && item.asset.trim() !== '')
      : [];

    await prisma.$transaction(async (tx) => {
      const snapshot = await tx.opportunitySnapshot.create({
        data: {
          scanTime,
          assetsScanned: payload.assetsScanned ?? null,
          passedStage1: payload.passedStage1 ?? null,
          passedStage2: payload.passedStage2 ?? null,
          deepDived: payload.deepDived ?? null,
          disqualified: payload.disqualified ?? 0,
          btcContext: toNullableJsonInput(payload.btcContext),
          rawPayload: payload as unknown as Prisma.InputJsonValue,
        },
      });

      if (opportunities.length > 0) {
        await tx.opportunitySignal.createMany({
          data: opportunities.map((item) => ({
            snapshotId: snapshot.id,
            asset: item.asset,
            direction: item.direction ?? null,
            leverage: item.leverage ?? null,
            finalScore: item.finalScore ?? null,
            scoreDelta: item.scoreDelta ?? null,
            scanStreak: item.scanStreak ?? null,
            hourlyTrend: item.hourlyTrend ?? null,
            trendAligned: Boolean(item.trendAligned),
            pillarScores: toNullableJsonInput(item.pillarScores),
            smartMoney: toNullableJsonInput(item.smartMoney),
            technicals: toNullableJsonInput(
              item.technicals
                ? { ...(item.technicals as object), regime: item.regime ?? null }
                : item.regime
                ? { regime: item.regime }
                : null
            ),
            funding: toNullableJsonInput(item.funding),
            risks: toNullableJsonInput(item.risks),
            exitLevels: toNullableJsonInput(item.exitLevels ?? null),
            positionSize: toNullableJsonInput(item.positionSize ?? null),
          })),
        });
      }

      const staleSnapshots = await tx.opportunitySnapshot.findMany({
        orderBy: { createdAt: 'desc' },
        skip: 200,
        select: { id: true },
      });

      if (staleSnapshots.length > 0) {
        await tx.opportunitySnapshot.deleteMany({
          where: { id: { in: staleSnapshots.map((row) => row.id) } },
        });
      }
    });

    logger.info(
      { opportunities: opportunities.length, elapsedMs: Date.now() - startedAt },
      'Stored opportunity snapshot'
    );

    return { opportunities, btcContext: payload.btcContext ?? null };
  }
}
