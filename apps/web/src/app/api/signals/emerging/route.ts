import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    const snapshot = await prisma.emergingMoverSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        alerts: {
          orderBy: [{ isImmediate: 'desc' }, { reasonCount: 'desc' }, { currentRank: 'asc' }],
          take: 12,
        },
      },
    });

    if (!snapshot) {
      return NextResponse.json(
        {
          snapshot: null,
          alerts: [],
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
          status: snapshot.status,
          signalTime: snapshot.signalTime.toISOString(),
          hasImmediate: snapshot.hasImmediate,
          hasEmergingMover: snapshot.hasEmergingMover,
          hasDeepClimber: snapshot.hasDeepClimber,
          totalMarkets: snapshot.totalMarkets,
          scansInHistory: snapshot.scansInHistory,
          createdAt: snapshot.createdAt.toISOString(),
        },
        alerts: snapshot.alerts.map((alert) => ({
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
        })),
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      }
    );
  } catch (error) {
    console.error('Failed to fetch emerging mover signals:', error);
    return NextResponse.json({ error: 'Failed to fetch emerging mover signals' }, { status: 500 });
  }
}
