import { getDb } from './db';
import { entityRegistry } from './entity-registry';
import { computeScores, type RawSignals } from './scoring';
import { collectPyPI } from './collectors/pypi';
import { collectNpm } from './collectors/npm';
import { collectHuggingFace } from './collectors/huggingface';
import { collectGitHub } from './collectors/github';
import { collectHackerNews } from './collectors/hackernews';
import { collectReddit } from './collectors/reddit';
import { collectArtificialAnalysis } from './collectors/artificial-analysis';
import { collectSemanticScholar } from './collectors/semantic-scholar';

interface CollectionResult {
  date: string;
  entitiesUpdated: number;
  sources: Record<string, { count: number; error?: string }>;
  durationMs: number;
}

async function safeCollect<T>(
  name: string,
  fn: () => Promise<T>,
  sources: Record<string, { count: number; error?: string }>,
): Promise<T | null> {
  try {
    const result = await fn();
    const count = result instanceof Map ? result.size : 0;
    sources[name] = { count };
    return result;
  } catch (err: any) {
    sources[name] = { count: 0, error: err.message ?? String(err) };
    return null;
  }
}

export async function runCollection(): Promise<CollectionResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  // Run collectors in parallel groups to respect rate limits
  // Group 1: No auth required, generous rate limits
  const [pypi, npm, hn] = await Promise.all([
    safeCollect('pypi', collectPyPI, sources),
    safeCollect('npm', collectNpm, sources),
    safeCollect('hackernews', collectHackerNews, sources),
  ]);

  // Group 2: May need auth or have stricter limits
  const [hf, github, aa] = await Promise.all([
    safeCollect('huggingface', collectHuggingFace, sources),
    safeCollect('github', collectGitHub, sources),
    safeCollect('artificialAnalysis', collectArtificialAnalysis, sources),
  ]);

  // Group 3: Rate-limited APIs (sequential within the collector)
  const [reddit, ss] = await Promise.all([
    safeCollect('reddit', collectReddit, sources),
    safeCollect('semanticScholar', collectSemanticScholar, sources),
  ]);

  // Assemble raw signals
  const raw: RawSignals = {
    pypiDownloads: pypi ?? new Map(),
    npmDownloads: npm ?? new Map(),
    huggingfaceSignal: hf ?? new Map(),
    githubStars: github ?? new Map(),
    hackernewsSignal: hn ?? new Map(),
    redditSignal: reddit ?? new Map(),
    artificialAnalysisScore: aa ?? new Map(),
    semanticScholarCitations: ss ?? new Map(),
  };

  // Compute scores
  const scores = computeScores(raw);

  // Ensure entities exist in DB
  const db = getDb();
  const insertEntity = db.prepare(`
    INSERT OR IGNORE INTO entities (id, name, category, company, release_date, pricing_tier, availability, open_source, description, logo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')
  `);
  const upsertScore = db.prepare(`
    INSERT INTO daily_scores (entity_id, date, usage_score, attention_score, capability_score, expert_score, total_score)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entity_id, date) DO UPDATE SET
      usage_score = excluded.usage_score,
      attention_score = excluded.attention_score,
      capability_score = excluded.capability_score,
      expert_score = excluded.expert_score,
      total_score = excluded.total_score
  `);

  let entitiesUpdated = 0;

  const writeAll = db.transaction(() => {
    for (const entity of entityRegistry) {
      insertEntity.run(
        entity.id, entity.name, entity.category, entity.company,
        entity.release_date, entity.pricing_tier, entity.availability,
        entity.open_source, entity.description,
      );

      const s = scores.get(entity.id);
      if (s) {
        upsertScore.run(entity.id, today, s.usage_score, s.attention_score, s.capability_score, s.expert_score, s.total_score);
        entitiesUpdated++;
      }
    }
  });

  writeAll();

  return {
    date: today,
    entitiesUpdated,
    sources,
    durationMs: Date.now() - start,
  };
}
