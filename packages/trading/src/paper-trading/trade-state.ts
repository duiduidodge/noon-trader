/**
 * Paper Trading State — JSON file persistence
 * Follows the same pattern as opportunity-scanner.ts state management.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { PaperTradingState } from './types.js';

const STATE_FILE = join(process.cwd(), 'artifacts', '.paper-trading-state.json');
const STATE_KEY = 'default';

function defaultState(initialEquity: number): PaperTradingState {
  return {
    account: {
      equity: initialEquity,
      peakEquity: initialEquity,
      drawdownPct: 0,
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      totalPnlUsd: 0,
      totalFeesUsd: 0,
      totalFundingUsd: 0,
      dailyPnlUsd: 0,
      dailyPnlDate: new Date().toISOString().slice(0, 10),
      isHalted: false,
    },
    openPositions: [],
    pendingOrders: [],
    recentTrades: [],
    lastSlByAsset: {},
  };
}

function normalizeState(state: PaperTradingState, initialEquity: number): PaperTradingState {
  if (!state.account) return defaultState(initialEquity);
  if (!state.openPositions) state.openPositions = [];
  if (!state.pendingOrders) state.pendingOrders = [];
  if (!state.recentTrades) state.recentTrades = [];
  if (!state.lastSlByAsset) state.lastSlByAsset = {};
  if (typeof state.account.totalFeesUsd !== 'number') state.account.totalFeesUsd = 0;
  if (typeof state.account.totalFundingUsd !== 'number') state.account.totalFundingUsd = 0;
  return state;
}

function toJsonState(state: PaperTradingState): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
}

async function readStateFromFile(initialEquity: number): Promise<PaperTradingState> {
  try {
    const raw = await readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as PaperTradingState;
    return normalizeState(parsed, initialEquity);
  } catch {
    return defaultState(initialEquity);
  }
}

async function writeStateToFile(state: PaperTradingState): Promise<void> {
  // Trim recent trades to last 100
  if (state.recentTrades.length > 100) {
    state.recentTrades = state.recentTrades.slice(-100);
  }

  try {
    await mkdir(dirname(STATE_FILE), { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('[paper-trading] Failed to save state:', err);
  }
}

async function readStateFromDatabase(
  prisma: PrismaClient,
  initialEquity: number,
): Promise<PaperTradingState | null> {
  try {
    const store = (prisma as any).paperTradingStore;
    const row = await store.findUnique({
      where: { key: STATE_KEY },
    });
    if (!row) return null;
    return normalizeState(row.state as unknown as PaperTradingState, initialEquity);
  } catch (err) {
    console.error('[paper-trading] Failed to load state from database:', err);
    return null;
  }
}

async function writeStateToDatabase(
  prisma: PrismaClient,
  state: PaperTradingState,
): Promise<void> {
  try {
    const store = (prisma as any).paperTradingStore;
    await store.upsert({
      where: { key: STATE_KEY },
      create: {
        key: STATE_KEY,
        state: toJsonState(state),
      },
      update: {
        state: toJsonState(state),
      },
    });
  } catch (err) {
    console.error('[paper-trading] Failed to save state to database:', err);
  }
}

export async function loadState(
  initialEquity: number,
  prisma?: PrismaClient,
): Promise<PaperTradingState> {
  if (prisma) {
    const dbState = await readStateFromDatabase(prisma, initialEquity);
    if (dbState) {
      await writeStateToFile(dbState);
      return dbState;
    }
  }

  const fileState = await readStateFromFile(initialEquity);
  if (prisma) {
    await writeStateToDatabase(prisma, fileState);
  }
  return fileState;
}

export async function saveState(
  state: PaperTradingState,
  prisma?: PrismaClient,
): Promise<void> {
  if (prisma) {
    await writeStateToDatabase(prisma, state);
  }
  await writeStateToFile(state);
}
