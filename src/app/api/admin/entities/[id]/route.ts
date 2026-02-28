import { NextRequest, NextResponse } from 'next/server';
import { getEntityById, getEntitySources, updateEntity, deleteEntity, setEntitySources } from '@/lib/db';
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const entity = await getEntityById(id);
    if (!entity) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const sources = await getEntitySources(id);
    return NextResponse.json({ ...entity, sources });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await getEntityById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { sources, ...fields } = body;

    if (Object.keys(fields).length > 0) {
      await updateEntity(id, fields);
    }

    if (sources && Array.isArray(sources)) {
      await setEntitySources(id, sources);
    }

    invalidateRegistryCache();
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await getEntityById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await deleteEntity(id);
    invalidateRegistryCache();
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
