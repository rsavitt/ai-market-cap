import { createClient, type Client } from '@libsql/client';

export interface Entity {
  id: string;
  name: string;
  category: string;
  company: string;
  release_date: string;
  pricing_tier: string;
  availability: string;
  open_source: number;
  description: string;
  logo_url: string;
}

export interface DailyScore {
  id: number;
  entity_id: string;
  date: string;
  usage_score: number;
  attention_score: number;
  capability_score: number;
  expert_score: number;
  total_score: number;
  confidence_lower: number | null;
  confidence_upper: number | null;
}

export interface RawSignal {
  id: number;
  entity_id: string;
  date: string;
  signal_name: string;
  raw_value: number | null;
}

export interface ProvenanceRecord {
  id: number;
  entity_id: string;
  timestamp: string;
  signal_contributions: string; // JSON
  previous_total: number | null;
  new_total: number;
  confidence: number;
}

export interface ScoredEntity extends Entity {
  usage_score: number;
  attention_score: number;
  capability_score: number;
  expert_score: number;
  total_score: number;
  confidence_lower: number | null;
  confidence_upper: number | null;
  overall_rank: number;
  category_rank: number;
  momentum_7d: number;
  volatility: number;
  date: string;
}

let client: Client | null = null;

export function getClient(): Client {
  if (client) return client;

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error('TURSO_DATABASE_URL is not set');
  }

  client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  return client;
}

async function migrateSchema(db: Client): Promise<void> {
  // Create migrations tracking table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const result = await db.execute('SELECT MAX(version) as v FROM _migrations');
  const version = (result.rows[0]?.v as number) ?? 0;

  if (version < 1) {
    await db.batch([
      {
        sql: `CREATE TABLE IF NOT EXISTS entities (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          company TEXT NOT NULL,
          release_date TEXT,
          pricing_tier TEXT,
          availability TEXT,
          open_source INTEGER DEFAULT 0,
          description TEXT,
          logo_url TEXT
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS daily_scores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_id TEXT NOT NULL REFERENCES entities(id),
          date TEXT NOT NULL,
          usage_score REAL,
          attention_score REAL,
          capability_score REAL,
          expert_score REAL,
          total_score REAL,
          confidence_lower REAL,
          confidence_upper REAL,
          UNIQUE(entity_id, date)
        )`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_ds_entity_date ON daily_scores(entity_id, date)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_ds_date ON daily_scores(date)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_entities_cat ON entities(category)`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS raw_signals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_id TEXT NOT NULL,
          date TEXT NOT NULL,
          signal_name TEXT NOT NULL,
          raw_value REAL,
          UNIQUE(entity_id, date, signal_name)
        )`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_rs_entity_signal ON raw_signals(entity_id, signal_name, date)`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS provenance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          signal_contributions TEXT,
          previous_total REAL,
          new_total REAL,
          confidence REAL
        )`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_prov_entity ON provenance(entity_id, timestamp)`,
        args: [],
      },
      {
        sql: `INSERT INTO _migrations (version) VALUES (1)`,
        args: [],
      },
    ], 'write');
  }
}

let migrated = false;

export async function ensureDb(): Promise<Client> {
  const db = getClient();
  if (!migrated) {
    await migrateSchema(db);
    migrated = true;
  }
  return db;
}

// ── Query helpers ──

export async function insertRawSignal(entityId: string, date: string, signalName: string, rawValue: number | null): Promise<void> {
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO raw_signals (entity_id, date, signal_name, raw_value)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(entity_id, date, signal_name) DO UPDATE SET raw_value = excluded.raw_value`,
    args: [entityId, date, signalName, rawValue],
  });
}

export async function getRawSignals(entityId: string, days: number): Promise<RawSignal[]> {
  const db = await ensureDb();
  const result = await db.execute({
    sql: `SELECT * FROM raw_signals
          WHERE entity_id = ? AND date >= date('now', '-' || ? || ' days')
          ORDER BY date DESC`,
    args: [entityId, days],
  });
  return result.rows as unknown as RawSignal[];
}

export async function getRawSignalValue(entityId: string, signalName: string, daysAgo: number): Promise<number | null> {
  const db = await ensureDb();
  const result = await db.execute({
    sql: `SELECT raw_value FROM raw_signals
          WHERE entity_id = ? AND signal_name = ? AND date <= date(?, '-' || ? || ' days')
          ORDER BY date DESC LIMIT 1`,
    args: [entityId, signalName, new Date().toISOString().split('T')[0], daysAgo],
  });
  const row = result.rows[0] as unknown as { raw_value: number | null } | undefined;
  return row?.raw_value ?? null;
}

export async function get90DayBaselines(category: string): Promise<Map<string, { min: number; max: number }>> {
  const db = await ensureDb();
  const result = await db.execute({
    sql: `SELECT rs.signal_name, MIN(rs.raw_value) as min_val, MAX(rs.raw_value) as max_val
          FROM raw_signals rs
          JOIN entities e ON rs.entity_id = e.id
          WHERE e.category = ? AND rs.date >= date('now', '-90 days') AND rs.raw_value IS NOT NULL
          GROUP BY rs.signal_name`,
    args: [category],
  });

  const baselines = new Map<string, { min: number; max: number }>();
  for (const row of result.rows as unknown as { signal_name: string; min_val: number; max_val: number }[]) {
    baselines.set(row.signal_name, { min: row.min_val, max: row.max_val });
  }
  return baselines;
}

export async function insertProvenance(
  entityId: string,
  timestamp: string,
  signalContributions: Record<string, number>,
  previousTotal: number | null,
  newTotal: number,
  confidence: number,
): Promise<void> {
  const db = await ensureDb();
  await db.execute({
    sql: `INSERT INTO provenance (entity_id, timestamp, signal_contributions, previous_total, new_total, confidence)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [entityId, timestamp, JSON.stringify(signalContributions), previousTotal, newTotal, confidence],
  });
}

export async function getPreviousDayScores(): Promise<Map<string, { total_score: number; date: string }>> {
  const db = await ensureDb();
  const latestResult = await db.execute('SELECT MAX(date) as max_date FROM daily_scores');
  const latestRow = latestResult.rows[0] as unknown as { max_date: string | null } | undefined;
  if (!latestRow?.max_date) return new Map();

  const result = await db.execute({
    sql: 'SELECT entity_id, total_score, date FROM daily_scores WHERE date = ?',
    args: [latestRow.max_date],
  });

  const map = new Map<string, { total_score: number; date: string }>();
  for (const row of result.rows as unknown as { entity_id: string; total_score: number; date: string }[]) {
    map.set(row.entity_id, { total_score: row.total_score, date: row.date });
  }
  return map;
}

export async function getScoreHistory(entityId: string, days: number): Promise<number[]> {
  const db = await ensureDb();
  const result = await db.execute({
    sql: 'SELECT total_score FROM daily_scores WHERE entity_id = ? ORDER BY date DESC LIMIT ?',
    args: [entityId, days],
  });
  return (result.rows as unknown as { total_score: number }[]).map(r => r.total_score);
}

export async function getAllEntities(): Promise<Entity[]> {
  const db = await ensureDb();
  const result = await db.execute('SELECT * FROM entities ORDER BY name');
  return result.rows as unknown as Entity[];
}

export async function getEntityById(id: string): Promise<Entity | undefined> {
  const db = await ensureDb();
  const result = await db.execute({
    sql: 'SELECT * FROM entities WHERE id = ?',
    args: [id],
  });
  return (result.rows[0] as unknown as Entity) ?? undefined;
}

export async function getDailyScores(entityId: string, days: number = 30): Promise<DailyScore[]> {
  const db = await ensureDb();
  const result = await db.execute({
    sql: 'SELECT * FROM daily_scores WHERE entity_id = ? ORDER BY date DESC LIMIT ?',
    args: [entityId, days],
  });
  return result.rows as unknown as DailyScore[];
}

export async function getCategoryEntities(category: string): Promise<Entity[]> {
  const db = await ensureDb();
  const result = await db.execute({
    sql: 'SELECT * FROM entities WHERE category = ? ORDER BY name',
    args: [category],
  });
  return result.rows as unknown as Entity[];
}

export async function getLatestScores(): Promise<ScoredEntity[]> {
  const db = await ensureDb();

  const latestResult = await db.execute('SELECT MAX(date) as max_date FROM daily_scores');
  const latestRow = latestResult.rows[0] as unknown as { max_date: string | null } | undefined;
  if (!latestRow?.max_date) return [];
  const latestDate = latestRow.max_date;

  const result = await db.execute({
    sql: `SELECT e.*, ds.usage_score, ds.attention_score, ds.capability_score, ds.expert_score,
                 ds.total_score, ds.confidence_lower, ds.confidence_upper, ds.date
          FROM entities e
          JOIN daily_scores ds ON e.id = ds.entity_id AND ds.date = ?
          ORDER BY ds.total_score DESC`,
    args: [latestDate],
  });

  const rows = result.rows as unknown as ScoredEntity[];

  // Overall ranks
  const sorted = [...rows].sort((a, b) => b.total_score - a.total_score);
  sorted.forEach((r, i) => r.overall_rank = i + 1);

  // Category ranks
  const byCategory: Record<string, ScoredEntity[]> = {};
  for (const r of sorted) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }
  for (const cat of Object.values(byCategory)) {
    cat.sort((a, b) => b.total_score - a.total_score);
    cat.forEach((r, i) => r.category_rank = i + 1);
  }

  // Momentum + volatility (parallel per entity)
  await Promise.all(sorted.map(async (entity) => {
    const [last7Result, last30Result] = await Promise.all([
      db.execute({
        sql: 'SELECT total_score FROM daily_scores WHERE entity_id = ? ORDER BY date DESC LIMIT 7',
        args: [entity.id],
      }),
      db.execute({
        sql: 'SELECT total_score FROM daily_scores WHERE entity_id = ? ORDER BY date DESC LIMIT 30',
        args: [entity.id],
      }),
    ]);

    const last7 = last7Result.rows as unknown as { total_score: number }[];
    if (last7.length >= 2) {
      const scores = last7.reverse().map(r => r.total_score);
      const n = scores.length;
      const xMean = (n - 1) / 2;
      const yMean = scores.reduce((a, b) => a + b, 0) / n;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        num += (i - xMean) * (scores[i] - yMean);
        den += (i - xMean) * (i - xMean);
      }
      entity.momentum_7d = den !== 0 ? Math.round((num / den) * 100) / 100 : 0;
    } else {
      entity.momentum_7d = 0;
    }

    const last30 = last30Result.rows as unknown as { total_score: number }[];
    if (last30.length >= 2) {
      const scores = last30.map(r => r.total_score);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / (scores.length - 1);
      entity.volatility = Math.round(Math.sqrt(variance) * 100) / 100;
    } else {
      entity.volatility = 0;
    }
  }));

  return sorted;
}
