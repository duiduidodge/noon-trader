import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    const snapshot = await prisma.whaleSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        traders: {
          orderBy: [{ score: 'desc' }, { rank: 'asc' }],
          take: 12,
        },
      },
    });

    if (!snapshot) {
      return NextResponse.json(
        {
          snapshot: null,
          traders: [],
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
          timeframe: snapshot.timeframe,
          candidates: snapshot.candidates,
          selectedCount: snapshot.selectedCount,
          createdAt: snapshot.createdAt.toISOString(),
        },
        traders: snapshot.traders.map((item) => ({
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
      {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      }
    );
  } catch (error) {
    console.error('Failed to fetch whale signals:', error);
    return NextResponse.json({ error: 'Failed to fetch whale signals' }, { status: 500 });
  }
}
