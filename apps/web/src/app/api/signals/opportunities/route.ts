import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    const snapshot = await prisma.opportunitySnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        opportunities: {
          orderBy: [{ finalScore: 'desc' }, { scanStreak: 'desc' }],
          take: 12,
        },
      },
    });

    if (!snapshot) {
      return NextResponse.json(
        {
          snapshot: null,
          opportunities: [],
        },
        {
          headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
        }
      );
    }

    return NextResponse.json(
      {
        snapshot: {
          id: snapshot.id,
          scanTime: snapshot.scanTime.toISOString(),
          assetsScanned: snapshot.assetsScanned,
          passedStage1: snapshot.passedStage1,
          passedStage2: snapshot.passedStage2,
          deepDived: snapshot.deepDived,
          disqualified: snapshot.disqualified,
          createdAt: snapshot.createdAt.toISOString(),
        },
        opportunities: snapshot.opportunities.map((item) => ({
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
        })),
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      }
    );
  } catch (error) {
    console.error('Failed to fetch opportunity signals:', error);
    return NextResponse.json({ error: 'Failed to fetch opportunity signals' }, { status: 500 });
  }
}
