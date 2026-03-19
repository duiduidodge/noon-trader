import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function toNum(v: { toNumber(): number } | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'number' ? v : v.toNumber();
}

function toToken(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function parseEmergingSignal(signal: string | null | undefined): { asset: string; direction: string } {
  const parts = (signal || '').trim().split(/\s+/).filter(Boolean);
  const asset = toToken(parts[0] || '');
  const rawDirection = (parts[1] || '').toUpperCase();
  const direction = rawDirection === 'SHORT' ? 'SHORT' : 'LONG';
  return { asset, direction };
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function safeNumberArray(value: unknown): number[] | null {
  return Array.isArray(value) ? (value as number[]) : null;
}

export async function GET() {
  try {
    const { prisma } = await import('@/lib/prisma');

    const [opportunitySnapshot, emergingSnapshot, whaleSnapshot] = await Promise.all([
      prisma.opportunitySnapshot.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          opportunities: {
            orderBy: [{ finalScore: 'desc' }, { scanStreak: 'desc' }],
            take: 20,
          },
        },
      }),
      prisma.emergingMoverSnapshot.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          alerts: {
            orderBy: [{ isImmediate: 'desc' }, { currentRank: 'asc' }],
            take: 20,
          },
        },
      }),
      prisma.whaleSnapshot.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          traders: {
            orderBy: [{ score: 'desc' }, { rank: 'asc' }],
            take: 5,
          },
        },
      }),
    ]);

    const whaleTopScore = whaleSnapshot?.traders?.[0]?.score
      ? Number(whaleSnapshot.traders[0].score)
      : null;
    const whaleBackdropBonus = whaleTopScore != null && whaleTopScore >= 80 ? 4 : 0;

    // Summary map for scoring
    const emergingByToken = new Map<
      string,
      { immediate: boolean; deep: boolean; direction: string; rank: number | null; traders: number | null; reasonCount: number }
    >();
    // Full alert map for enrichment (prefer immediate over deep climber)
    type AlertPrismaRow = NonNullable<typeof emergingSnapshot>['alerts'][number];
    const emergingFullMap = new Map<string, AlertPrismaRow>();

    for (const alert of emergingSnapshot?.alerts || []) {
      const parsed = parseEmergingSignal(alert.signal);
      const token = parsed.asset;
      if (!token) continue;

      const current = emergingByToken.get(token) || {
        immediate: false,
        deep: false,
        direction: (alert.direction || parsed.direction || 'LONG').toUpperCase(),
        rank: alert.currentRank,
        traders: alert.traders,
        reasonCount: 0,
      };
      emergingByToken.set(token, {
        immediate: current.immediate || alert.isImmediate,
        deep: current.deep || alert.isDeepClimber,
        direction: current.direction || (alert.direction || parsed.direction || 'LONG').toUpperCase(),
        rank: current.rank ?? alert.currentRank,
        traders: current.traders ?? alert.traders,
        reasonCount: Math.max(current.reasonCount, alert.reasonCount || 0),
      });

      // Keep the most important alert per token
      const existing = emergingFullMap.get(token);
      if (!existing || (!existing.isImmediate && alert.isImmediate)) {
        emergingFullMap.set(token, alert);
      }
    }

    const setups: ReturnType<typeof buildSetup>[] = [];

    for (const item of opportunitySnapshot?.opportunities || []) {
      const token = toToken(item.asset);
      if (!token) continue;

      const trendBonus = item.trendAligned ? 6 : 0;
      // finalScore is sum of 3 pillars (each 0–100) + entry bonus, range 0–320. Divide by 3 to normalize to 0–100.
      const scoreBase = Math.min(85, Math.max(45, Math.round((item.finalScore || 0) / 3)));
      const emerging = emergingByToken.get(token);
      const emergingBonus = emerging ? (emerging.immediate ? 10 : emerging.deep ? 6 : 3) : 0;
      const confidence = Math.min(99, scoreBase + trendBonus + emergingBonus + whaleBackdropBonus);

      const thesisBits = [
        `score ${item.finalScore ?? '-'}`,
        `streak ${item.scanStreak ?? 0}`,
        item.hourlyTrend ? item.hourlyTrend.toLowerCase() : null,
        emerging?.immediate ? 'immediate mover' : emerging?.deep ? 'deep climber' : null,
      ].filter(Boolean);

      setups.push(buildSetup({
        id: item.id,
        asset: token,
        direction: (item.direction || 'LONG').toUpperCase(),
        confidence,
        thesis: thesisBits.join(' • '),
        scoreBreakdown: { base: scoreBase, trendBonus, emergingBonus, whaleBonus: whaleBackdropBonus },
        opportunity: {
          finalScore: item.finalScore ?? 0,
          scanStreak: item.scanStreak,
          hourlyTrend: item.hourlyTrend,
          trendAligned: item.trendAligned,
          leverage: item.leverage,
          pillarScores: item.pillarScores as Record<string, number> | null,
          smartMoney: item.smartMoney as Record<string, unknown> | null,
          technicals: item.technicals as Record<string, unknown> | null,
          funding: item.funding as Record<string, unknown> | null,
          risks: safeStringArray(item.risks),
          exitLevels: item.exitLevels as Record<string, unknown> | null,
          positionSize: item.positionSize as Record<string, unknown> | null,
        },
        emergingAlert: emergingFullMap.get(token) ?? null,
        whaleTopScore,
      }));
    }

    // Fallback: emerging-only setups
    if (setups.length === 0) {
      for (const [token, emerging] of emergingByToken.entries()) {
        const base = emerging.immediate ? 78 : emerging.deep ? 72 : 66;
        const confidence = Math.min(
          96,
          base + Math.min(10, emerging.reasonCount || 0) + whaleBackdropBonus
        );
        const thesis = [
          emerging.immediate ? 'immediate mover' : emerging.deep ? 'deep climber' : 'emerging activity',
          emerging.rank != null ? `rank #${emerging.rank}` : null,
          emerging.traders != null ? `${emerging.traders} traders` : null,
          (emerging.reasonCount || 0) > 0 ? `${emerging.reasonCount} signals` : null,
        ]
          .filter(Boolean)
          .join(' • ');

        setups.push(buildSetup({
          id: `emerging-${token}`,
          asset: token,
          direction: (emerging.direction || 'LONG').toUpperCase(),
          confidence,
          thesis,
          scoreBreakdown: {
            base,
            trendBonus: 0,
            emergingBonus: Math.min(10, emerging.reasonCount || 0),
            whaleBonus: whaleBackdropBonus,
          },
          opportunity: null,
          emergingAlert: emergingFullMap.get(token) ?? null,
          whaleTopScore,
        }));
      }
    }

    const ranked = setups.sort((a, b) => b.confidence - a.confidence).slice(0, 6);

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        snapshotTimes: {
          opportunity: opportunitySnapshot?.scanTime?.toISOString?.() || null,
          emerging: emergingSnapshot?.signalTime?.toISOString?.() || null,
          whale: whaleSnapshot?.scanTime?.toISOString?.() || null,
        },
        whaleTopScore,
        setups: ranked,
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      }
    );
  } catch (error) {
    console.error('Failed to build trade setups:', error);
    return NextResponse.json({ error: 'Failed to build trade setups' }, { status: 500 });
  }
}

type AlertRow = {
  currentRank: number | null;
  contribution: { toNumber(): number } | number | null;
  contribVelocity: { toNumber(): number } | number | null;
  priceChg4h: { toNumber(): number } | number | null;
  traders: number | null;
  reasons: unknown;
  isImmediate: boolean;
  isDeepClimber: boolean;
  erratic: boolean;
  lowVelocity: boolean;
  rankHistory: unknown;
  contribHistory: unknown;
  reasonCount: number;
  signal: string | null;
  direction: string | null;
};

function buildSetup(params: {
  id: string;
  asset: string;
  direction: string;
  confidence: number;
  thesis: string;
  scoreBreakdown: { base: number; trendBonus: number; emergingBonus: number; whaleBonus: number };
  opportunity: {
    finalScore: number;
    scanStreak: number | null;
    hourlyTrend: string | null;
    trendAligned: boolean;
    leverage: number | null;
    pillarScores: Record<string, number> | null;
    smartMoney: Record<string, unknown> | null;
    technicals: Record<string, unknown> | null;
    funding: Record<string, unknown> | null;
    risks: string[];
    exitLevels: Record<string, unknown> | null;
    positionSize: Record<string, unknown> | null;
  } | null;
  emergingAlert: AlertRow | null;
  whaleTopScore: number | null;
}) {
  const { id, asset, direction, confidence, thesis, scoreBreakdown, opportunity, emergingAlert, whaleTopScore } = params;

  return {
    id,
    asset,
    direction,
    confidence,
    thesis,
    scoreBreakdown,
    opportunity,
    emerging: emergingAlert
      ? {
          currentRank: emergingAlert.currentRank,
          contribution: toNum(emergingAlert.contribution),
          contribVelocity: toNum(emergingAlert.contribVelocity),
          priceChg4h: toNum(emergingAlert.priceChg4h),
          traders: emergingAlert.traders,
          reasons: safeStringArray(emergingAlert.reasons),
          isImmediate: emergingAlert.isImmediate,
          isDeepClimber: emergingAlert.isDeepClimber,
          erratic: emergingAlert.erratic,
          lowVelocity: emergingAlert.lowVelocity,
          rankHistory: safeNumberArray(emergingAlert.rankHistory),
          contribHistory: safeNumberArray(emergingAlert.contribHistory),
          reasonCount: emergingAlert.reasonCount,
        }
      : null,
    whaleTopScore,
  };
}
