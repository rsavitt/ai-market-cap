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
}

export interface ScoredEntity extends Entity {
  usage_score: number;
  attention_score: number;
  capability_score: number;
  expert_score: number;
  total_score: number;
  overall_rank: number;
  category_rank: number;
  momentum_7d: number;
  volatility: number;
  date: string;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(path.join(dataDir, 'aimarketcap.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
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

  return db;
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
    SELECT e.*, ds.usage_score, ds.attention_score, ds.capability_score, ds.expert_score, ds.total_score, ds.date
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
