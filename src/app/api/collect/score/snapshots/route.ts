import { NextRequest, NextResponse } from 'next/server';
import { listScoreSnapshots, restoreScoreSnapshot } from '@/lib/collect';

export const dynamic = 'force-dynamic';

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

// GET: list available snapshots
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshots = await listScoreSnapshots();
    return NextResponse.json({ snapshots });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Failed to list snapshots' }, { status: 500 });
  }
}

// POST: restore a snapshot by run_id
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const runId = body.run_id;
    if (!runId || typeof runId !== 'string') {
      return NextResponse.json({ error: 'run_id is required' }, { status: 400 });
    }

    const result = await restoreScoreSnapshot(runId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Restore failed' }, { status: 500 });
  }
}
