import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let state: unknown = null;

    if (process.env.DATABASE_URL) {
      const { prisma } = await import('@/lib/prisma');
      const store = await prisma.paperTradingStore.findUnique({
        where: { key: 'default' },
      });
      state = store?.state ?? null;
    } else {
      try {
        const filePath = join(process.cwd(), 'artifacts', '.paper-trading-state.json');
        const raw = await readFile(filePath, 'utf-8');
        state = JSON.parse(raw);
      } catch {
        state = null;
      }
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      state,
    });
  } catch (error) {
    console.error('Failed to fetch paper trading state:', error);
    return NextResponse.json({ error: 'Failed to fetch paper trading state' }, { status: 500 });
  }
}
