import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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

let db: Database.Database | null = null;

function migrateSchema(database: Database.Database): void {
  const version = (database.pragma('user_version', { simple: true }) as number) ?? 0;

  if (version < 1) {
    // v1: base schema
    database.exec(`
      CREATE TABLE IF NOT EXISTS entities (
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
      );

      CREATE TABLE IF NOT EXISTS daily_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT NOT NULL REFERENCES entities(id),
        date TEXT NOT NULL,
        usage_score REAL,
        attention_score REAL,
        capability_score REAL,
        expert_score REAL,
        total_score REAL,
        UNIQUE(entity_id, date)
      );

      CREATE INDEX IF NOT EXISTS idx_ds_entity_date ON daily_scores(entity_id, date);
      CREATE INDEX IF NOT EXISTS idx_ds_date ON daily_scores(date);
      CREATE INDEX IF NOT EXISTS idx_entities_cat ON entities(category);
    `);
    database.pragma('user_version = 1');
  }

  if (version < 2) {
    // v2: raw signals, provenance, confidence bands
    database.exec(`
      CREATE TABLE IF NOT EXISTS raw_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT NOT NULL,
        date TEXT NOT NULL,
        signal_name TEXT NOT NULL,
        raw_value REAL,
        UNIQUE(entity_id, date, signal_name)
      );

      CREATE INDEX IF NOT EXISTS idx_rs_entity_signal ON raw_signals(entity_id, signal_name, date);

      CREATE TABLE IF NOT EXISTS provenance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        signal_contributions TEXT,
        previous_total REAL,
        new_total REAL,
        confidence REAL
      );

      CREATE INDEX IF NOT EXISTS idx_prov_entity ON provenance(entity_id, timestamp);
    `);

    // Add confidence columns to daily_scores if they don't exist
    const columns = database.prepare("PRAGMA table_info(daily_scores)").all() as { name: string }[];
    const colNames = new Set(columns.map(c => c.name));
    if (!colNames.has('confidence_lower')) {
      database.exec('ALTER TABLE daily_scores ADD COLUMN confidence_lower REAL');
    }
    if (!colNames.has('confidence_upper')) {
      database.exec('ALTER TABLE daily_scores ADD COLUMN confidence_upper REAL');
    }

    database.pragma('user_version = 2');
  }
}

export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(path.join(dataDir, 'aimarketcap.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrateSchema(db);

  return db;
}

// ── Query helpers ──

export function insertRawSignal(entityId: string, date: string, signalName: string, rawValue: number | null): void {
  getDb().prepare(`
    INSERT INTO raw_signals (entity_id, date, signal_name, raw_value)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(entity_id, date, signal_name) DO UPDATE SET raw_value = excluded.raw_value
  `).run(entityId, date, signalName, rawValue);
}

export function getRawSignals(entityId: string, days: number): RawSignal[] {
  return getDb().prepare(`
    SELECT * FROM raw_signals
    WHERE entity_id = ? AND date >= date('now', '-' || ? || ' days')
    ORDER BY date DESC
  `).all(entityId, days) as RawSignal[];
}

export function getRawSignalValue(entityId: string, signalName: string, daysAgo: number): number | null {
  const row = getDb().prepare(`
    SELECT raw_value FROM raw_signals
    WHERE entity_id = ? AND signal_name = ? AND date <= date(?, '-' || ? || ' days')
    ORDER BY date DESC LIMIT 1
  `).get(entityId, signalName, new Date().toISOString().split('T')[0], daysAgo) as { raw_value: number | null } | undefined;
  return row?.raw_value ?? null;
}

export function get90DayBaselines(category: string): Map<string, { min: number; max: number }> {
  const rows = getDb().prepare(`
    SELECT rs.signal_name, MIN(rs.raw_value) as min_val, MAX(rs.raw_value) as max_val
    FROM raw_signals rs
    JOIN entities e ON rs.entity_id = e.id
    WHERE e.category = ? AND rs.date >= date('now', '-90 days') AND rs.raw_value IS NOT NULL
    GROUP BY rs.signal_name
  `).all(category) as { signal_name: string; min_val: number; max_val: number }[];

  const baselines = new Map<string, { min: number; max: number }>();
  for (const row of rows) {
    baselines.set(row.signal_name, { min: row.min_val, max: row.max_val });
  }
  return baselines;
}

export function insertProvenance(
  entityId: string,
  timestamp: string,
  signalContributions: Record<string, number>,
  previousTotal: number | null,
  newTotal: number,
  confidence: number,
): void {
  getDb().prepare(`
    INSERT INTO provenance (entity_id, timestamp, signal_contributions, previous_total, new_total, confidence)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entityId, timestamp, JSON.stringify(signalContributions), previousTotal, newTotal, confidence);
}

export function getPreviousDayScores(): Map<string, { total_score: number; date: string }> {
  const database = getDb();
  const latestRow = database.prepare('SELECT MAX(date) as max_date FROM daily_scores').get() as any;
  if (!latestRow?.max_date) return new Map();

  const rows = database.prepare(`
    SELECT entity_id, total_score, date FROM daily_scores WHERE date = ?
  `).all(latestRow.max_date) as { entity_id: string; total_score: number; date: string }[];

  const result = new Map<string, { total_score: number; date: string }>();
  for (const row of rows) {
    result.set(row.entity_id, { total_score: row.total_score, date: row.date });
  }
  return result;
}

export function getScoreHistory(entityId: string, days: number): number[] {
  const rows = getDb().prepare(
    'SELECT total_score FROM daily_scores WHERE entity_id = ? ORDER BY date DESC LIMIT ?'
  ).all(entityId, days) as { total_score: number }[];
  return rows.map(r => r.total_score);
}

export function getAllEntities(): Entity[] {
  return getDb().prepare('SELECT * FROM entities ORDER BY name').all() as Entity[];
}

export function getEntityById(id: string): Entity | undefined {
  return getDb().prepare('SELECT * FROM entities WHERE id = ?').get(id) as Entity | undefined;
}

export function getDailyScores(entityId: string, days: number = 30): DailyScore[] {
  return getDb().prepare(
    'SELECT * FROM daily_scores WHERE entity_id = ? ORDER BY date DESC LIMIT ?'
  ).all(entityId, days) as DailyScore[];
}

export function getCategoryEntities(category: string): Entity[] {
  return getDb().prepare('SELECT * FROM entities WHERE category = ? ORDER BY name').all(category) as Entity[];
}

export function getLatestScores(): ScoredEntity[] {
  const database = getDb();

  const latestRow = database.prepare('SELECT MAX(date) as max_date FROM daily_scores').get() as any;
  if (!latestRow?.max_date) return [];
  const latestDate = latestRow.max_date;

  const rows = database.prepare(`
    SELECT e.*, ds.usage_score, ds.attention_score, ds.capability_score, ds.expert_score,
           ds.total_score, ds.confidence_lower, ds.confidence_upper, ds.date
    FROM entities e
    JOIN daily_scores ds ON e.id = ds.entity_id AND ds.date = ?
    ORDER BY ds.total_score DESC
  `).all(latestDate) as ScoredEntity[];

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

  // Momentum + volatility
  for (const entity of sorted) {
    const last7 = database.prepare(
      'SELECT total_score FROM daily_scores WHERE entity_id = ? ORDER BY date DESC LIMIT 7'
    ).all(entity.id) as { total_score: number }[];

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

    const last30 = database.prepare(
      'SELECT total_score FROM daily_scores WHERE entity_id = ? ORDER BY date DESC LIMIT 30'
    ).all(entity.id) as { total_score: number }[];

    if (last30.length >= 2) {
      const scores = last30.map(r => r.total_score);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / (scores.length - 1);
      entity.volatility = Math.round(Math.sqrt(variance) * 100) / 100;
    } else {
      entity.volatility = 0;
    }
  }

  return sorted;
}
