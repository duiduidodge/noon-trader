import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function safeJson(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    const [oppSnapshot, emergingSnapshot, whaleSnapshot] = await Promise.all([
      prisma.opportunitySnapshot.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          opportunities: {
            orderBy: [{ finalScore: 'desc' }, { scanStreak: 'desc' }],
            take: 12,
          },
        },
      }),
      prisma.emergingMoverSnapshot.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          alerts: {
            orderBy: [{ isImmediate: 'desc' }, { reasonCount: 'desc' }, { currentRank: 'asc' }],
            take: 12,
          },
        },
      }),
      prisma.whaleSnapshot.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          traders: {
            orderBy: [{ score: 'desc' }, { rank: 'asc' }],
            take: 12,
          },
        },
      }),
    ]);

    return NextResponse.json(
      {
        opportunities: {
          snapshot: oppSnapshot
            ? (() => {
                const rawP = safeJson(oppSnapshot.rawPayload);
                return {
                  id: oppSnapshot.id,
                  scanTime: oppSnapshot.scanTime.toISOString(),
                  assetsScanned: oppSnapshot.assetsScanned,
                  passedStage1: oppSnapshot.passedStage1,
                  passedStage2: oppSnapshot.passedStage2,
                  deepDived: oppSnapshot.deepDived,
                  disqualified: oppSnapshot.disqualified,
                  filteredByGates: typeof rawP?.filteredByGates === 'number' ? rawP.filteredByGates : null,
                  btcContext: safeJson(oppSnapshot.btcContext),
                  createdAt: oppSnapshot.createdAt.toISOString(),
                };
              })()
            : null,
          items: (oppSnapshot?.opportunities ?? []).map((item) => ({
            id: item.id,
            asset: item.asset,
            direction: item.direction,
            leverage: item.leverage,
            finalScore: item.finalScore,
            scoreDelta: item.scoreDelta,
            scanStreak: item.scanStreak,
            hourlyTrend: item.hourlyTrend,
            trendAligned: item.trendAligned,
            risks: toStringArray(item.risks),
            pillarScores: safeJson(item.pillarScores),
            smartMoney: safeJson(item.smartMoney),
            technicals: safeJson(item.technicals),
            funding: safeJson(item.funding),
          })),
        },
        emerging: {
          snapshot: emergingSnapshot
            ? {
                id: emergingSnapshot.id,
                status: emergingSnapshot.status,
                signalTime: emergingSnapshot.signalTime.toISOString(),
                hasImmediate: emergingSnapshot.hasImmediate,
                hasEmergingMover: emergingSnapshot.hasEmergingMover,
                hasDeepClimber: emergingSnapshot.hasDeepClimber,
                totalMarkets: emergingSnapshot.totalMarkets,
                scansInHistory: emergingSnapshot.scansInHistory,
                createdAt: emergingSnapshot.createdAt.toISOString(),
              }
            : null,
          alerts: (emergingSnapshot?.alerts ?? []).map((alert) => ({
            id: alert.id,
            signal: alert.signal,
            direction: alert.direction,
            currentRank: alert.currentRank,
            contribution: alert.contribution ? Number(alert.contribution) : null,
            contribVelocity: alert.contribVelocity ? Number(alert.contribVelocity) : null,
            traders: alert.traders,
            priceChg4h: alert.priceChg4h ? Number(alert.priceChg4h) : null,
            reasonCount: alert.reasonCount,
            reasons: toStringArray(alert.reasons),
            isImmediate: alert.isImmediate,
            isDeepClimber: alert.isDeepClimber,
            erratic: alert.erratic,
            lowVelocity: alert.lowVelocity,
            rankHistory: safeJson(alert.rankHistory) as unknown as number[] | null,
            contribHistory: safeJson(alert.contribHistory) as unknown as number[] | null,
          })),
        },
        whales: {
          snapshot: whaleSnapshot
            ? {
                id: whaleSnapshot.id,
                scanTime: whaleSnapshot.scanTime.toISOString(),
                timeframe: whaleSnapshot.timeframe,
                candidates: whaleSnapshot.candidates,
                selectedCount: whaleSnapshot.selectedCount,
                createdAt: whaleSnapshot.createdAt.toISOString(),
              }
            : null,
          traders: (whaleSnapshot?.traders ?? []).map((item) => ({
            id: item.id,
            walletAddress: item.walletAddress,
            score: item.score ? Number(item.score) : null,
            rank: item.rank,
            consistency: item.consistency,
            riskLabel: item.riskLabel,
            pnlRank: item.pnlRank,
            winRate: item.winRate ? Number(item.winRate) : null,
            holdTimeHours: item.holdTimeHours ? Number(item.holdTimeHours) : null,
            maxDrawdownPct: item.maxDrawdownPct ? Number(item.maxDrawdownPct) : null,
            allocationPct: item.allocationPct ? Number(item.allocationPct) : null,
            overlapRiskPct: item.overlapRiskPct ? Number(item.overlapRiskPct) : null,
          })),
        },
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      }
    );
  } catch (error) {
    console.error('Failed to fetch deep signals:', error);
    return NextResponse.json({ error: 'Failed to fetch deep signals' }, { status: 500 });
  }
}
