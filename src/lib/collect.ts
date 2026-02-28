import { ensureDb, getPreviousDayScores } from './db';
import { getEntityRegistry } from './entity-registry';
import { computeScores, type RawSignals } from './scoring';
import { collectPyPI } from './collectors/pypi';
import { collectNpm } from './collectors/npm';
import { collectHuggingFace } from './collectors/huggingface';
import { collectGitHub } from './collectors/github';
import { collectHackerNews } from './collectors/hackernews';
import { collectReddit } from './collectors/reddit';
import { collectArtificialAnalysis } from './collectors/artificial-analysis';
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
 * Write all raw signal values to the raw_signals table for historical tracking.
 */
async function storeRawSignals(raw: RawSignals, githubAbsolute: Map<string, number>, today: string): Promise<void> {
  const signalEntries: [string, Map<string, number>][] = [
    ['pypi_downloads', raw.pypiDownloads],
    ['npm_downloads', raw.npmDownloads],
    ['huggingface_signal', raw.huggingfaceSignal],
    ['github_stars', githubAbsolute],
    ['github_stars_velocity', raw.githubStars],
    ['hackernews_signal', raw.hackernewsSignal],
    ['reddit_signal', raw.redditSignal],
    ['artificial_analysis_score', raw.artificialAnalysisScore],
    ['open_router_signal', raw.openRouterSignal],
    ['open_router_usage', raw.openRouterUsage],
    ['semantic_scholar_citations', raw.semanticScholarCitations],
  ];

  const db = await ensureDb();
  const stmts: { sql: string; args: any[] }[] = [];

  for (const [signalName, values] of signalEntries) {
    values.forEach((value, entityId) => {
      stmts.push({
        sql: `INSERT INTO raw_signals (entity_id, date, signal_name, raw_value)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(entity_id, date, signal_name) DO UPDATE SET raw_value = excluded.raw_value`,
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

    // Record which signals contributed
    const signalChecks: [string, Map<string, number>][] = [
      ['pypi_downloads', raw.pypiDownloads],
      ['npm_downloads', raw.npmDownloads],
      ['huggingface_signal', raw.huggingfaceSignal],
      ['github_stars', raw.githubStars],
      ['hackernews_signal', raw.hackernewsSignal],
      ['reddit_signal', raw.redditSignal],
      ['artificial_analysis_score', raw.artificialAnalysisScore],
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

export async function runCollection(): Promise<CollectionResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};
  const anomalies: string[] = [];

  // Ensure DB is initialized
  await ensureDb();

  // Load entity registry from DB
  const entityRegistry = await getEntityRegistry();

  // Run collectors in parallel groups to respect rate limits
  // Group 1: No auth required, generous rate limits
  const [pypi, npm, hn] = await Promise.all([
    safeCollect('pypi', collectPyPI, sources),
    safeCollect('npm', collectNpm, sources),
    safeCollect('hackernews', collectHackerNews, sources),
  ]);

  // Group 2: May need auth or have stricter limits
  const [hf, githubResult, aa, or, orUsage] = await Promise.all([
    safeCollect('huggingface', collectHuggingFace, sources),
    safeCollect('github', collectGitHub, sources),
    safeCollect('artificialAnalysis', collectArtificialAnalysis, sources),
    safeCollect('openRouter', collectOpenRouter, sources),
    safeCollect('openRouterUsage', collectOpenRouterUsage, sources),
  ]);

  // Group 3: Rate-limited APIs (sequential within the collector)
  const [reddit, ss] = await Promise.all([
    safeCollect('reddit', collectReddit, sources),
    safeCollect('semanticScholar', collectSemanticScholar, sources),
  ]);

  // Extract GitHub velocity and absolute values
  const githubVelocity = githubResult?.velocity ?? new Map<string, number>();
  const githubAbsolute = githubResult?.absolute ?? new Map<string, number>();

  // Assemble raw signals (using velocity for scoring)
  const raw: RawSignals = {
    pypiDownloads: pypi ?? new Map(),
    npmDownloads: npm ?? new Map(),
    huggingfaceSignal: hf ?? new Map(),
    openRouterUsage: orUsage ?? new Map(),
    githubStars: githubVelocity,
    hackernewsSignal: hn ?? new Map(),
    redditSignal: reddit ?? new Map(),
    artificialAnalysisScore: aa ?? new Map(),
    openRouterSignal: or ?? new Map(),
    semanticScholarCitations: ss ?? new Map(),
  };

  // Store all raw signals for historical baselines
  await storeRawSignals(raw, githubAbsolute, today);

  // Compute scores
  const scores = await computeScores(raw);

  // Anomaly detection (sequential — each call awaits DB)
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
  const db = await ensureDb();

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
              ON CONFLICT(entity_id, date) DO UPDATE SET
                usage_score = excluded.usage_score,
                attention_score = excluded.attention_score,
                capability_score = excluded.capability_score,
                expert_score = excluded.expert_score,
                total_score = excluded.total_score,
                confidence_lower = excluded.confidence_lower,
                confidence_upper = excluded.confidence_upper`,
        args: [entity.id, today, s.usage_score, s.attention_score, s.capability_score, s.expert_score, s.total_score, s.confidence_lower, s.confidence_upper],
      });
      entitiesUpdated++;
    }
  }

  await db.batch([...entityStmts, ...scoreStmts], 'write');

  if (anomalies.length > 0) {
    console.log(`[anomaly] ${anomalies.length} anomalies detected:`, anomalies);
  }

  return {
    date: today,
    entitiesUpdated,
    sources,
    anomalies,
    durationMs: Date.now() - start,
  };
}
