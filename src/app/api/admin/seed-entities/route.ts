import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { invalidateRegistryCache } from '@/lib/entity-registry';
import { SEED_ENTITIES } from './data';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const apiKey = process.env.ADMIN_API_KEY;
  const authHeader = request.headers.get('authorization');
  const providedKey = authHeader?.replace('Bearer ', '');
  if (apiKey && providedKey === apiKey) return true;
  if (!apiKey) return true; // dev mode
  return false;
}

function flattenSources(entityId: string, sources: Record<string, string | string[] | null>): { source_type: string; source_value: string }[] {
  const rows: { source_type: string; source_value: string }[] = [];
  for (const [type, value] of Object.entries(sources)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        rows.push({ source_type: type, source_value: v });
      }
    } else {
      rows.push({ source_type: type, source_value: value });
    }
  }
  return rows;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await ensureDb();
    let entitiesInserted = 0;
    let sourcesInserted = 0;

    // Insert entities
    const entityStmts: { sql: string; args: any[] }[] = [];
    for (const e of SEED_ENTITIES) {
      entityStmts.push({
        sql: `INSERT OR IGNORE INTO entities (id, name, category, company, release_date, pricing_tier, availability, open_source, description, logo_url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
        args: [e.id, e.name, e.category, e.company, e.release_date, e.pricing_tier, e.availability, e.open_source, e.description],
      });
    }
    await db.batch(entityStmts, 'write');
    entitiesInserted = SEED_ENTITIES.length;

    // Insert sources
    const sourceStmts: { sql: string; args: any[] }[] = [];
    for (const e of SEED_ENTITIES) {
      const rows = flattenSources(e.id, e.sources);
      for (const r of rows) {
        sourceStmts.push({
          sql: `INSERT OR IGNORE INTO entity_sources (entity_id, source_type, source_value) VALUES (?, ?, ?)`,
          args: [e.id, r.source_type, r.source_value],
        });
        sourcesInserted++;
      }
    }
    await db.batch(sourceStmts, 'write');

    invalidateRegistryCache();

    return NextResponse.json({
      success: true,
      entitiesInserted,
      sourcesInserted,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 });
  }
}
