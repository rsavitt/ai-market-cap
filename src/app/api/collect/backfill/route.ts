import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const apiKey = process.env.COLLECT_API_KEY;
  const authHeader = request.headers.get('authorization');
  const providedKey = authHeader?.replace('Bearer ', '');

  if (cronSecret && providedKey === cronSecret) return true;
  if (apiKey && providedKey === apiKey) return true;
  if (!cronSecret && !apiKey) return true;

  return false;
}

/**
 * Simple seeded PRNG for reproducible daily variation.
 * Includes signal name in seed so different signals vary independently.
 * Returns a value in [1 - amplitude, 1 + amplitude].
 */
function seededVariation(entityId: string, dayOffset: number, signalName: string, amplitude = 0.05): number {
  let hash = 0;
  const seed = `${entityId}:${signalName}:${dayOffset}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const normalized = (Math.abs(hash) % 10000) / 10000;
  return 1 - amplitude + normalized * 2 * amplitude;
}

/**
 * Read the most recent value per entity for every signal in raw_signals.
 */
async function getLatestSignals(db: ReturnType<typeof import('@libsql/client').createClient>): Promise<Map<string, Map<string, number>>> {
  const rows = await db.execute(
    `SELECT entity_id, signal_name, raw_value, date FROM raw_signals
     WHERE raw_value IS NOT NULL
     ORDER BY date DESC`
  );

  const signals = new Map<string, Map<string, number>>();

  for (const row of rows.rows) {
    const signalName = row.signal_name as string;
    const entityId = row.entity_id as string;
    const value = row.raw_value as number;

    if (!signals.has(signalName)) signals.set(signalName, new Map());
    const entityMap = signals.get(signalName)!;
    if (!entityMap.has(entityId)) entityMap.set(entityId, value);
  }

  return signals;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '30', 10) || 30, 1), 90);

    const db = await ensureDb();

    console.log(`[backfill] Reading existing signal data from DB...`);
    const signals = await getLatestSignals(db);

    if (signals.size === 0) {
      return NextResponse.json(
        { error: 'No existing signal data found in raw_signals. Run collectors first.' },
        { status: 400 },
      );
    }

    const signalCounts: Record<string, number> = {};
    const entitiesCovered: Record<string, number> = {};

    signals.forEach((entityMap, signalName) => {
      signalCounts[signalName] = 0;
      entitiesCovered[signalName] = entityMap.size;
    });

    // Build all statements, then batch in chunks
    const BATCH_SIZE = 200;

    for (let dayOffset = 1; dayOffset <= days; dayOffset++) {
      const date = new Date();
      date.setDate(date.getDate() - dayOffset);
      const dateStr = date.toISOString().split('T')[0];

      const stmts: { sql: string; args: any[] }[] = [];

      signals.forEach((entityMap, signalName) => {
        entityMap.forEach((value, entityId) => {
          const variation = seededVariation(entityId, dayOffset, signalName);
          const variedValue = Math.round(value * variation);
          stmts.push({
            sql: `INSERT INTO raw_signals (entity_id, date, signal_name, raw_value)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(entity_id, date, signal_name) DO UPDATE SET raw_value = excluded.raw_value`,
            args: [entityId, dateStr, signalName, variedValue],
          });
          signalCounts[signalName]++;
        });
      });

      // Batch in chunks to avoid hitting limits
      for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
        const chunk = stmts.slice(i, i + BATCH_SIZE);
        await db.batch(chunk, 'write');
      }
    }

    const totalInserts = Object.values(signalCounts).reduce((a, b) => a + b, 0);
    console.log(`[backfill] Done: ${days} days, ${totalInserts} total inserts across ${signals.size} signals`);

    return NextResponse.json({
      daysBackfilled: days,
      signalsBackfilled: signals.size,
      totalInserts,
      signalCounts,
      entitiesCovered,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Backfill failed' },
      { status: 500 },
    );
  }
}
