import { NextRequest, NextResponse } from 'next/server';
import { getAllEntitiesWithSources, insertEntity, setEntitySources } from '@/lib/db';
import { invalidateRegistryCache } from '@/lib/entity-registry';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const apiKey = process.env.ADMIN_API_KEY;
  const authHeader = request.headers.get('authorization');
  const providedKey = authHeader?.replace('Bearer ', '');
  if (apiKey && providedKey === apiKey) return true;
  if (!apiKey) return true; // dev mode
  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const entities = await getAllEntitiesWithSources();
    return NextResponse.json(entities);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, category, company, release_date, pricing_tier, availability, open_source, description, sources } = body;

    if (!id || !name || !category || !company) {
      return NextResponse.json({ error: 'Missing required fields: id, name, category, company' }, { status: 400 });
    }

    await insertEntity({
      id, name, category, company,
      release_date: release_date ?? '',
      pricing_tier: pricing_tier ?? '',
      availability: availability ?? '',
      open_source: open_source ?? 0,
      description: description ?? '',
    });

    if (sources && Array.isArray(sources)) {
      await setEntitySources(id, sources);
    }

    invalidateRegistryCache();
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
