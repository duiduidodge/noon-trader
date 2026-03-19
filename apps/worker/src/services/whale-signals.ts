import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { Prisma, type PrismaClient } from '@prisma/client';

const logger = console;
const exec = promisify(execCb);

type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

interface RawTrader {
  walletAddress?: string;
  wallet?: string;
  address?: string;
  rank?: number;
  pnlRank?: number;
  winRate?: number;
  win_rate?: number;
  consistency?: string;
  consistencyLabel?: string;
  riskLabel?: string;
  risk?: string;
  holdTimeHours?: number;
  hold_time_hours?: number;
  maxDrawdownPct?: number;
  max_drawdown_pct?: number;
  maxDrawdown?: number;
  averageHoldTimeSeconds?: number;
  tcsLabel?: string;
  returnOnInvestment?: number;
  profitAndLoss?: number;
  overlapRiskPct?: number;
  overlap_risk_pct?: number;
}

interface RawPayload {
  success?: boolean;
  data?: unknown;
}

function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in command output');
  }
  return text.slice(start, end + 1);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDataList(data: unknown): RawTrader[] {
  if (Array.isArray(data)) return data as RawTrader[];
  if (!data || typeof data !== 'object') return [];

  const obj = data as Record<string, unknown>;
  const candidates = ['traders', 'items', 'results', 'data'];
  for (const key of candidates) {
    if (Array.isArray(obj[key])) return obj[key] as RawTrader[];
  }
  return [];
}

function normalizeTrader(raw: RawTrader): Required<Pick<RawTrader, 'walletAddress'>> & {
  rank: number | null;
  pnlRank: number | null;
  winRate: number | null;
  consistency: string | null;
  riskLabel: string | null;
  holdTimeHours: number | null;
  maxDrawdownPct: number | null;
  overlapRiskPct: number | null;
  returnOnInvestment: number | null;
  profitAndLoss: number | null;
} {
  const walletAddress =
    (raw.walletAddress || raw.wallet || raw.address || '').toString().trim();

  return {
    walletAddress,
    rank: toNumber(raw.rank),
    pnlRank: toNumber(raw.pnlRank),
    winRate: toNumber(raw.winRate ?? raw.win_rate),
    consistency: (raw.consistency || raw.consistencyLabel || raw.tcsLabel || '').toString().trim() || null,
    riskLabel: (raw.riskLabel || raw.risk || '').toString().trim() || null,
    holdTimeHours: toNumber(raw.holdTimeHours ?? raw.hold_time_hours ?? ((raw.averageHoldTimeSeconds ?? 0) / 3600)),
    maxDrawdownPct: toNumber(raw.maxDrawdownPct ?? raw.max_drawdown_pct ?? Math.abs(raw.maxDrawdown ?? 0)),
    overlapRiskPct: toNumber(raw.overlapRiskPct ?? raw.overlap_risk_pct),
    returnOnInvestment: toNumber(raw.returnOnInvestment),
    profitAndLoss: toNumber(raw.profitAndLoss),
  };
}

function normalizeComponent(value: number | null, min: number, max: number): number {
  if (value == null) return 50;
  if (max <= min) return 50;
  const clamped = Math.min(max, Math.max(min, value));
  return ((clamped - min) / (max - min)) * 100;
}

function consistencyScore(label: string | null): number {
  const v = (label || '').toUpperCase();
  if (v.includes('ELITE')) return 100;
  if (v.includes('RELIABLE')) return 80;
  if (v.includes('BALANCED')) return 60;
  if (v.includes('STREAKY')) return 55;
  return 40;
}

function riskAllowed(profile: RiskProfile, consistency: string | null): boolean {
  const v = (consistency || '').toUpperCase();
  if (profile === 'conservative') return v.includes('ELITE') || v.includes('RELIABLE');
  if (profile === 'moderate') return v.includes('ELITE') || v.includes('RELIABLE') || v.includes('STREAKY');
  return v.includes('ELITE') || v.includes('RELIABLE') || v.includes('BALANCED') || v.includes('STREAKY');
}

function computeWhaleScore(params: {
  rank: number | null;
  pnlRank: number | null;
  winRate: number | null;
  consistency: string | null;
  holdTimeHours: number | null;
  maxDrawdownPct: number | null;
  returnOnInvestment: number | null;
  profitAndLoss: number | null;
}): number {
  const pnlRank = params.pnlRank ?? params.rank;
  const pnlScore = pnlRank == null ? 50 : normalizeComponent(101 - pnlRank, 1, 100);
  const roiScore = normalizeComponent(params.returnOnInvestment, 0, 700);
  const pnlSizeScore = normalizeComponent(params.profitAndLoss, 0, 3_000_000);
  const winRateScore = normalizeComponent(params.winRate, 0, 100);
  const consistencyVal = consistencyScore(params.consistency);
  const holdTimeScore = normalizeComponent(params.holdTimeHours, 1, 72);
  const drawdownScore = params.maxDrawdownPct == null
    ? 50
    : normalizeComponent(100 - params.maxDrawdownPct, 0, 100);

  return Number(
    (
      0.2 * pnlScore +
      0.2 * roiScore +
      0.1 * pnlSizeScore +
      0.2 * winRateScore +
      0.15 * consistencyVal +
      0.05 * holdTimeScore +
      0.1 * drawdownScore
    ).toFixed(2)
  );
}

export interface WhaleTraderResult {
  walletAddress: string;
  score: number;
  rank: number | null;
  winRate: number | null;
  consistency: string | null;
  holdTimeHours: number | null;
  allocationPct: number | null;
}

export class WhaleSignalsService {
  private readonly enabled: boolean;
  private readonly riskProfile: RiskProfile;

  constructor(opts: { enabled: boolean; riskProfile: RiskProfile }) {
    this.enabled = opts.enabled;
    this.riskProfile = opts.riskProfile;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async pollAndPersist(prisma: PrismaClient): Promise<WhaleTraderResult[]> {
    if (!this.enabled) return [];

    const startedAt = Date.now();
    const command = 'mcporter call senpi.discovery_get_top_traders limit=50';

    const { stdout, stderr } = await exec(command, {
      timeout: 90_000,
      maxBuffer: 3 * 1024 * 1024,
      shell: '/bin/bash',
      env: process.env,
    });

    const combinedOutput = `${stdout || ''}\n${stderr || ''}`.trim();
    if (!combinedOutput) {
      throw new Error('Whale signals command returned empty output');
    }

    const parsed = JSON.parse(extractJsonObject(combinedOutput)) as RawPayload;
    if (parsed.success === false) {
      throw new Error('discovery_top_traders returned success=false');
    }

    const traders = normalizeDataList(parsed.data)
      .map(normalizeTrader)
      .filter((t) => t.walletAddress !== '');

    const scored = traders
      .map((t, idx) => ({
        ...t,
        rank: t.rank ?? idx + 1,
        score: computeWhaleScore({
          rank: t.rank ?? idx + 1,
          pnlRank: t.pnlRank,
          winRate: t.winRate,
          consistency: t.consistency,
          holdTimeHours: t.holdTimeHours,
          maxDrawdownPct: t.maxDrawdownPct,
          returnOnInvestment: t.returnOnInvestment,
          profitAndLoss: t.profitAndLoss,
        }),
      }))
      .filter((t) => riskAllowed(this.riskProfile, t.consistency))
      .sort((a, b) => b.score - a.score);

    const selected = scored.slice(0, 5);
    const totalScore = selected.reduce((sum, item) => sum + item.score, 0);

    await prisma.$transaction(async (tx) => {
      const snapshot = await tx.whaleSnapshot.create({
        data: {
          scanTime: new Date(),
          timeframe: '30d',
          candidates: traders.length,
          selectedCount: selected.length,
          rawPayload: parsed as Prisma.InputJsonValue,
        },
      });

      if (selected.length > 0) {
        await tx.whaleTrader.createMany({
          data: selected.map((item) => ({
            snapshotId: snapshot.id,
            walletAddress: item.walletAddress,
            score: item.score,
            rank: item.rank,
            consistency: item.consistency,
            riskLabel: item.riskLabel,
            pnlRank: item.pnlRank,
            winRate: item.winRate,
            holdTimeHours: item.holdTimeHours,
            maxDrawdownPct: item.maxDrawdownPct,
            overlapRiskPct: item.overlapRiskPct,
            allocationPct: totalScore > 0 ? Number(((item.score / totalScore) * 100).toFixed(2)) : null,
          })),
        });
      }

      const staleSnapshots = await tx.whaleSnapshot.findMany({
        orderBy: { createdAt: 'desc' },
        skip: 120,
        select: { id: true },
      });

      if (staleSnapshots.length > 0) {
        await tx.whaleSnapshot.deleteMany({ where: { id: { in: staleSnapshots.map((r) => r.id) } } });
      }
    });

    logger.info(
      {
        candidates: traders.length,
        selected: selected.length,
        riskProfile: this.riskProfile,
        elapsedMs: Date.now() - startedAt,
      },
      'Stored whale snapshot'
    );

    return selected.map((item) => ({
      walletAddress: item.walletAddress,
      score: item.score,
      rank: item.rank,
      winRate: item.winRate,
      consistency: item.consistency,
      holdTimeHours: item.holdTimeHours,
      allocationPct: totalScore > 0 ? Number(((item.score / totalScore) * 100).toFixed(2)) : null,
    }));
  }
}
