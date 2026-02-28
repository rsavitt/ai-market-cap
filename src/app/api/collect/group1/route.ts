import { NextRequest, NextResponse } from 'next/server';
import { runGroup1 } from '@/lib/collect';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runGroup1();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Group 1 collection failed' },
      { status: 500 },
    );
  }
}
