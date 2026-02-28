import { ensureDb, getPreviousDayScores } from './db';
import { getEntityRegistry } from './entity-registry';
import { computeScores, type RawSignals } from './scoring';
import { collectPyPI } from './collectors/pypi';
import { collectNpm } from './collectors/npm';
import { collectHuggingFace } from './collectors/huggingface';
import { collectGitHub } from './collectors/github';
import { collectHackerNews } from './collectors/hackernews';
import { collectReddit } from './collectors/reddit';
import { collectOpenRouter, collectOpenRouterUsage } from './collectors/open-router';
import { collectSemanticScholar } from './collectors/semantic-scholar';
import { detectVelocityAnomaly } from './anomaly';

interface CollectionResult {
  date: string;
  entitiesUpdated: number;
  sources: Record<string, { count: number; error?: string }>;
  anomalies: string[];
  durationMs: number;
}

export interface GroupResult {
  date: string;
  sources: Record<string, { count: number; error?: string }>;
  durationMs: number;
}

export interface ScoringResult {
  date: string;
  entitiesUpdated: number;
  anomalies: string[];
  durationMs: number;
}

async function safeCollect<T>(
  name: string,
  fn: () => Promise<T>,
  sources: Record<string, { count: number; error?: string }>,
): Promise<T | null> {
  try {
    const result = await fn();
    const count = result instanceof Map ? result.size :
      (result && typeof result === 'object' && 'velocity' in result) ? (result as any).velocity.size : 0;
    sources[name] = { count };
    return result;
  } catch (err: any) {
    sources[name] = { count: 0, error: err.message ?? String(err) };
    return null;
  }
}

/**
 * Write raw signal values to the raw_signals table for historical tracking.
 */
async function storeRawSignals(signalEntries: [string, Map<string, number>][], today: string): Promise<void> {
  const db = await ensureDb();
  const stmts: { sql: string; args: any[] }[] = [];

  for (const [signalName, values] of signalEntries) {
    values.forEach((value, entityId) => {
      stmts.push({
        sql: `INSERT INTO raw_signals (entity_id, date, signal_name, raw_value)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(entity_id, date, signal_name) DO UPDATE SET raw_value = MAX(raw_value, excluded.raw_value)`,
        args: [entityId, today, signalName, value],
      });
    });
  }

  if (stmts.length > 0) {
    await db.batch(stmts, 'write');
  }
}

/**
 * Write provenance records comparing new scores to previous day.
 */
async function writeProvenance(
  scores: Map<string, { usage_score: number; attention_score: number; capability_score: number; expert_score: number; total_score: number; confidence: number }>,
  raw: RawSignals,
): Promise<void> {
  const previousScores = await getPreviousDayScores();
  const timestamp = new Date().toISOString();

  const db = await ensureDb();
  const stmts: { sql: string; args: any[] }[] = [];

  scores.forEach((score, entityId) => {
    const prev = previousScores.get(entityId);
    const signalContributions: Record<string, number> = {};

    const signalChecks: [string, Map<string, number>][] = [
      ['pypi_downloads', raw.pypiDownloads],
      ['npm_downloads', raw.npmDownloads],
      ['huggingface_signal', raw.huggingfaceSignal],
      ['github_stars', raw.githubStars],
      ['hackernews_signal', raw.hackernewsSignal],
      ['reddit_signal', raw.redditSignal],
      ['open_router_signal', raw.openRouterSignal],
      ['open_router_usage', raw.openRouterUsage],
      ['semantic_scholar_citations', raw.semanticScholarCitations],
    ];

    for (const [name, map] of signalChecks) {
      const val = map.get(entityId);
      if (val !== undefined) {
        signalContributions[name] = val;
      }
    }

    stmts.push({
      sql: `INSERT INTO provenance (entity_id, timestamp, signal_contributions, previous_total, new_total, confidence)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [entityId, timestamp, JSON.stringify(signalContributions), prev?.total_score ?? null, score.total_score, score.confidence],
    });
  });

  if (stmts.length > 0) {
    await db.batch(stmts, 'write');
  }
}

/**
 * Group 1: PyPI + NPM + HackerNews
 * No auth required, generous rate limits.
 */
export async function runGroup1(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const [pypi, npm, hn] = await Promise.all([
    safeCollect('pypi', collectPyPI, sources),
    safeCollect('npm', collectNpm, sources),
    safeCollect('hackernews', collectHackerNews, sources),
  ]);

  await storeRawSignals([
    ['pypi_downloads', pypi ?? new Map()],
    ['npm_downloads', npm ?? new Map()],
    ['hackernews_signal', hn ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 2: HuggingFace + GitHub + OpenRouter
 * May need auth or have stricter limits.
 */
export async function runGroup2(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const [hf, githubResult, or, orUsage] = await Promise.all([
    safeCollect('huggingface', collectHuggingFace, sources),
    safeCollect('github', collectGitHub, sources),
    safeCollect('openRouter', collectOpenRouter, sources),
    safeCollect('openRouterUsage', collectOpenRouterUsage, sources),
  ]);

  const githubVelocity = githubResult?.velocity ?? new Map<string, number>();
  const githubAbsolute = githubResult?.absolute ?? new Map<string, number>();

  await storeRawSignals([
    ['huggingface_signal', hf ?? new Map()],
    ['github_stars', githubAbsolute],
    ['github_stars_velocity', githubVelocity],
    ['open_router_signal', or ?? new Map()],
    ['open_router_usage', orUsage ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 3: Reddit + Semantic Scholar
 * Rate-limited APIs.
 */
export async function runGroup3(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const [reddit, ss] = await Promise.all([
    safeCollect('reddit', collectReddit, sources),
    safeCollect('semanticScholar', collectSemanticScholar, sources),
  ]);

  await storeRawSignals([
    ['reddit_signal', reddit ?? new Map()],
    ['semantic_scholar_citations', ss ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Scoring: read raw signals from DB, compute scores, detect anomalies, write results.
 * Runs after all collector groups have finished.
 */
export async function runScoring(): Promise<ScoringResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const anomalies: string[] = [];

  await ensureDb();
  const entityRegistry = await getEntityRegistry();

  // Read today's raw signals from DB to assemble RawSignals
  const db = await ensureDb();
  const raw: RawSignals = {
    pypiDownloads: new Map(),
    npmDownloads: new Map(),
    huggingfaceSignal: new Map(),
    openRouterUsage: new Map(),
    githubStars: new Map(),
    hackernewsSignal: new Map(),
    redditSignal: new Map(),
    openRouterSignal: new Map(),
    semanticScholarCitations: new Map(),
  };

  const signalMapping: [string, keyof RawSignals][] = [
    ['pypi_downloads', 'pypiDownloads'],
    ['npm_downloads', 'npmDownloads'],
    ['huggingface_signal', 'huggingfaceSignal'],
    ['github_stars_velocity', 'githubStars'],
    ['hackernews_signal', 'hackernewsSignal'],
    ['reddit_signal', 'redditSignal'],
    ['open_router_signal', 'openRouterSignal'],
    ['open_router_usage', 'openRouterUsage'],
    ['semantic_scholar_citations', 'semanticScholarCitations'],
  ];

  const rows = await db.execute({
    sql: `SELECT entity_id, signal_name, raw_value FROM raw_signals WHERE date = ?`,
    args: [today],
  });

  for (const row of rows.rows) {
    const entityId = row.entity_id as string;
    const signalName = row.signal_name as string;
    const value = row.raw_value as number;
    for (const [dbName, rawKey] of signalMapping) {
      if (signalName === dbName) {
        raw[rawKey].set(entityId, value);
        break;
      }
    }
  }

  // Compute scores
  const scores = await computeScores(raw);

  // Anomaly detection
  const scoreEntries = Array.from(scores.entries());
  for (const [entityId, score] of scoreEntries) {
    const anomalyResult = await detectVelocityAnomaly(entityId, score.total_score);
    if (anomalyResult.isAnomaly) {
      anomalies.push(`${entityId}: ${anomalyResult.reason}`);
    }
  }

  // Write provenance records
  await writeProvenance(scores, raw);

  // Ensure entities exist in DB and write scores
  const entityStmts: { sql: string; args: any[] }[] = [];
  const scoreStmts: { sql: string; args: any[] }[] = [];
  let entitiesUpdated = 0;

  for (const entity of entityRegistry) {
    entityStmts.push({
      sql: `INSERT OR IGNORE INTO entities (id, name, category, company, release_date, pricing_tier, availability, open_source, description, logo_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
      args: [entity.id, entity.name, entity.category, entity.company, entity.release_date, entity.pricing_tier, entity.availability, entity.open_source, entity.description],
    });

    const s = scores.get(entity.id);
    if (s) {
      scoreStmts.push({
        sql: `INSERT INTO daily_scores (entity_id, date, usage_score, attention_score, capability_score, expert_score, total_score, confidence_lower, confidence_upper)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(entity_id, date) DO NOTHING`,
        args: [entity.id, today, s.usage_score, s.attention_score, s.capability_score, s.expert_score, s.total_score, s.confidence_lower, s.confidence_upper],
      });
      entitiesUpdated++;
    }
  }

  await db.batch([...entityStmts, ...scoreStmts], 'write');

  if (anomalies.length > 0) {
    console.log(`[anomaly] ${anomalies.length} anomalies detected:`, anomalies);
  }

  return { date: today, entitiesUpdated, anomalies, durationMs: Date.now() - start };
}

/**
 * Full collection: runs all groups sequentially then scores.
 * Convenience for local dev and the existing /api/collect endpoint.
 */
export async function runCollection(): Promise<CollectionResult> {
  const start = Date.now();
  const sources: Record<string, { count: number; error?: string }> = {};

  const g1 = await runGroup1();
  Object.assign(sources, g1.sources);

  const g2 = await runGroup2();
  Object.assign(sources, g2.sources);

  const g3 = await runGroup3();
  Object.assign(sources, g3.sources);

  const scoring = await runScoring();

  return {
    date: scoring.date,
    entitiesUpdated: scoring.entitiesUpdated,
    sources,
    anomalies: scoring.anomalies,
    durationMs: Date.now() - start,
  };
}
