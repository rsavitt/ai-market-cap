import { NextRequest, NextResponse } from 'next/server';
import { runCollection } from '@/lib/collect';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 2 minutes for all API calls

function isAuthorized(request: NextRequest): boolean {
  // Vercel Cron sends CRON_SECRET via Authorization header
  const cronSecret = process.env.CRON_SECRET;
  const apiKey = process.env.COLLECT_API_KEY;
  const authHeader = request.headers.get('authorization');
  const providedKey = authHeader?.replace('Bearer ', '');

  if (cronSecret && providedKey === cronSecret) return true;
  if (apiKey && providedKey === apiKey) return true;
  if (!cronSecret && !apiKey) return true; // No auth configured = allow (dev mode)

  return false;
}

// GET: called by Vercel Cron
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runCollection();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Collection failed' },
      { status: 500 },
    );
  }
}

// POST: called manually or from external cron
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runCollection();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? 'Collection failed' },
      { status: 500 },
    );
  }
}
