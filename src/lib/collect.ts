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
import { collectOpenAlex } from './collectors/openalex';
import { collectGroq } from './collectors/groq';
import { collectArtificialAnalysis } from './collectors/artificial-analysis';
import { collectSmolAI } from './collectors/smolai';
import { collectOpenWebUI } from './collectors/openwebui';
import { collectGoogleTrends } from './collectors/google-trends';
import { collectLmsysArena } from './collectors/lmsys-arena';
import { collectHfLeaderboard } from './collectors/hf-leaderboard';
import { collectCloudflareRadar } from './collectors/cloudflare-radar';
import { collectOllama } from './collectors/ollama';
import { collectStackOverflow } from './collectors/stackoverflow';
import { collectArxiv } from './collectors/arxiv';
import { collectManifoldMarkets } from './collectors/manifold-markets';
import { collectWikipediaPageviews } from './collectors/wikipedia-pageviews';
import { collectDockerHub } from './collectors/docker-hub';
import { collectModelScope } from './collectors/modelscope';
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
    let count = 0;
    if (result instanceof Map) {
      count = result.size;
    } else if (result && typeof result === 'object') {
      // Find the first Map property to report count (works for GitHub's {velocity}, HF's {signal}, etc.)
      for (const val of Object.values(result)) {
        if (val instanceof Map && val.size > 0) {
          count = val.size;
          break;
        }
      }
    }
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
      ['hf_downloads', raw.hfDownloads],
      ['hf_likes', raw.hfLikes],
      ['hf_downloads_velocity', raw.hfDownloadsVelocity],
      ['github_stars', raw.githubStars],
      ['github_forks', raw.githubForks],
      ['github_clones', raw.githubClones],
      ['github_views', raw.githubViews],
      ['hackernews_signal', raw.hackernewsSignal],
      ['reddit_signal', raw.redditSignal],
      ['smolai_signal', raw.smolaiSignal],
      ['google_trends_signal', raw.googleTrendsSignal],
      ['stackoverflow_signal', raw.stackoverflowSignal],
      ['wikipedia_pageviews', raw.wikipediaPageviews],
      ['open_router_signal', raw.openRouterSignal],
      ['open_router_usage', raw.openRouterUsage],
      ['openwebui_usage', raw.openWebUIUsage],
      ['cloudflare_radar', raw.cloudflareRadar],
      ['ollama_signal', raw.ollamaSignal],
      ['docker_hub_pulls', raw.dockerHubPulls],
      ['modelscope_signal', raw.modelscopeSignal],
      ['groq_signal', raw.groqSignal],
      ['aa_llm_intelligence', raw.aaLlmIntelligence],
      ['aa_image_arena', raw.aaImageArena],
      ['aa_video_arena', raw.aaVideoArena],
      ['lmsys_arena', raw.lmsysArena],
      ['hf_leaderboard', raw.hfLeaderboard],
      ['github_release_frequency', raw.githubReleaseFrequency],
      ['github_commit_activity', raw.githubCommitActivity],
      ['github_issue_resolution', raw.githubIssueResolution],
      ['semantic_scholar_citations', raw.semanticScholarCitations],
      ['open_alex_citations', raw.openAlexCitations],
      ['arxiv_mention_velocity', raw.arxivMentionVelocity],
      ['manifold_markets', raw.manifoldMarkets],
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

  const [pypi, npm, hn, smolai, googleTrends, cfRadar, ollama, stackoverflow, wiki, docker, modelscope] = await Promise.all([
    safeCollect('pypi', collectPyPI, sources),
    safeCollect('npm', collectNpm, sources),
    safeCollect('hackernews', collectHackerNews, sources),
    safeCollect('smolai', collectSmolAI, sources),
    safeCollect('googleTrends', collectGoogleTrends, sources),
    safeCollect('cloudflareRadar', collectCloudflareRadar, sources),
    safeCollect('ollama', collectOllama, sources),
    safeCollect('stackoverflow', collectStackOverflow, sources),
    safeCollect('wikipediaPageviews', collectWikipediaPageviews, sources),
    safeCollect('dockerHub', collectDockerHub, sources),
    safeCollect('modelscope', collectModelScope, sources),
  ]);

  await storeRawSignals([
    ['pypi_downloads', pypi ?? new Map()],
    ['npm_downloads', npm ?? new Map()],
    ['hackernews_signal', hn ?? new Map()],
    ['smolai_signal', smolai ?? new Map()],
    ['google_trends_signal', googleTrends ?? new Map()],
    ['cloudflare_radar', cfRadar ?? new Map()],
    ['ollama_signal', ollama ?? new Map()],
    ['stackoverflow_signal', stackoverflow ?? new Map()],
    ['wikipedia_pageviews', wiki ?? new Map()],
    ['docker_hub_pulls', docker ?? new Map()],
    ['modelscope_signal', modelscope ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 1 sub-collector: Google Trends standalone
 */
export async function runGroup1GoogleTrends(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const googleTrends = await safeCollect('googleTrends', collectGoogleTrends, sources);

  await storeRawSignals([
    ['google_trends_signal', googleTrends ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 1 sub-collector: Ollama standalone
 */
export async function runGroup1Ollama(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const ollama = await safeCollect('ollama', collectOllama, sources);

  await storeRawSignals([
    ['ollama_signal', ollama ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 1 sub-collector: Stack Overflow standalone
 */
export async function runGroup1StackOverflow(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const stackoverflow = await safeCollect('stackoverflow', collectStackOverflow, sources);

  await storeRawSignals([
    ['stackoverflow_signal', stackoverflow ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 1 sub-collector: ModelScope standalone
 */
export async function runGroup1ModelScope(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const modelscope = await safeCollect('modelscope', collectModelScope, sources);

  await storeRawSignals([
    ['modelscope_signal', modelscope ?? new Map()],
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

  const [hfResult, githubResult, or, orUsage, groq, aaResult, lmsysArena, hfLeaderboard] = await Promise.all([
    safeCollect('huggingface', collectHuggingFace, sources),
    safeCollect('github', collectGitHub, sources),
    safeCollect('openRouter', collectOpenRouter, sources),
    safeCollect('openRouterUsage', collectOpenRouterUsage, sources),
    safeCollect('groq', collectGroq, sources),
    safeCollect('artificialAnalysis', collectArtificialAnalysis, sources),
    safeCollect('lmsysArena', collectLmsysArena, sources),
    safeCollect('hfLeaderboard', collectHfLeaderboard, sources),
  ]);

  const hfSignal = hfResult?.signal ?? new Map<string, number>();
  const hfDownloads = hfResult?.downloads ?? new Map<string, number>();
  const hfLikes = hfResult?.likes ?? new Map<string, number>();
  const hfDownloadsVelocity = hfResult?.downloadsVelocity ?? new Map<string, number>();

  const githubVelocity = githubResult?.velocity ?? new Map<string, number>();
  const githubAbsolute = githubResult?.absolute ?? new Map<string, number>();
  const githubForks = githubResult?.forks ?? new Map<string, number>();
  const githubForksVelocity = githubResult?.forksVelocity ?? new Map<string, number>();
  const githubClones = githubResult?.clones ?? new Map<string, number>();
  const githubViews = githubResult?.views ?? new Map<string, number>();
  const githubReleaseFrequency = githubResult?.releaseFrequency ?? new Map<string, number>();
  const githubCommitActivity = githubResult?.commitActivity ?? new Map<string, number>();
  const githubIssueResolution = githubResult?.issueResolutionRate ?? new Map<string, number>();

  await storeRawSignals([
    ['huggingface_signal', hfSignal],
    ['hf_downloads', hfDownloads],
    ['hf_likes', hfLikes],
    ['hf_downloads_velocity', hfDownloadsVelocity],
    ['github_stars', githubAbsolute],
    ['github_stars_velocity', githubVelocity],
    ['github_forks', githubForks],
    ['github_forks_velocity', githubForksVelocity],
    ['github_clones', githubClones],
    ['github_views', githubViews],
    ['github_release_frequency', githubReleaseFrequency],
    ['github_commit_activity', githubCommitActivity],
    ['github_issue_resolution', githubIssueResolution],
    ['open_router_signal', or ?? new Map()],
    ['open_router_usage', orUsage ?? new Map()],
    ['groq_signal', groq ?? new Map()],
    ['aa_llm_intelligence', aaResult?.llmIntelligence ?? new Map()],
    ['aa_image_arena', aaResult?.imageArena ?? new Map()],
    ['aa_video_arena', aaResult?.videoArena ?? new Map()],
    ['lmsys_arena', lmsysArena ?? new Map()],
    ['hf_leaderboard', hfLeaderboard ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 3a: Reddit
 */
export async function runGroup3Reddit(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const reddit = await safeCollect('reddit', collectReddit, sources);

  await storeRawSignals([
    ['reddit_signal', reddit ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 3b: Semantic Scholar
 */
export async function runGroup3SemanticScholar(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  // Give S2 a 100s budget so we finish well within Vercel's 300s limit
  const ss = await safeCollect('semanticScholar', () => collectSemanticScholar(100_000), sources);

  await storeRawSignals([
    ['semantic_scholar_citations', ss ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 3c: OpenAlex
 */
export async function runGroup3OpenAlex(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const oa = await safeCollect('openAlex', collectOpenAlex, sources);

  await storeRawSignals([
    ['open_alex_citations', oa ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 3d: OpenWebUI community leaderboard
 */
export async function runGroup3OpenWebUI(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const owui = await safeCollect('openWebUI', collectOpenWebUI, sources);

  await storeRawSignals([
    ['openwebui_usage', owui ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 3e: arXiv mention velocity
 */
export async function runGroup3Arxiv(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const arxiv = await safeCollect('arxiv', collectArxiv, sources);

  await storeRawSignals([
    ['arxiv_mention_velocity', arxiv ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 3f: Manifold Markets prediction market sentiment
 */
export async function runGroup3ManifoldMarkets(): Promise<GroupResult> {
  const start = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const sources: Record<string, { count: number; error?: string }> = {};

  await ensureDb();

  const manifold = await safeCollect('manifoldMarkets', collectManifoldMarkets, sources);

  await storeRawSignals([
    ['manifold_markets', manifold ?? new Map()],
  ], today);

  return { date: today, sources, durationMs: Date.now() - start };
}

/**
 * Group 3: Reddit + Semantic Scholar + OpenAlex + OpenWebUI + arXiv + Manifold (convenience wrapper)
 * Runs all sub-collectors sequentially.
 */
export async function runGroup3(): Promise<GroupResult> {
  const start = Date.now();
  const sources: Record<string, { count: number; error?: string }> = {};

  const r = await runGroup3Reddit();
  Object.assign(sources, r.sources);

  const ss = await runGroup3SemanticScholar();
  Object.assign(sources, ss.sources);

  const oa = await runGroup3OpenAlex();
  Object.assign(sources, oa.sources);

  const owui = await runGroup3OpenWebUI();
  Object.assign(sources, owui.sources);

  const arxiv = await runGroup3Arxiv();
  Object.assign(sources, arxiv.sources);

  const manifold = await runGroup3ManifoldMarkets();
  Object.assign(sources, manifold.sources);

  return { date: r.date, sources, durationMs: Date.now() - start };
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
    hfDownloads: new Map(),
    hfLikes: new Map(),
    hfDownloadsVelocity: new Map(),
    openRouterUsage: new Map(),
    openWebUIUsage: new Map(),
    cloudflareRadar: new Map(),
    ollamaSignal: new Map(),
    githubStars: new Map(),
    githubForks: new Map(),
    githubClones: new Map(),
    githubViews: new Map(),
    dockerHubPulls: new Map(),
    modelscopeSignal: new Map(),
    hackernewsSignal: new Map(),
    redditSignal: new Map(),
    smolaiSignal: new Map(),
    googleTrendsSignal: new Map(),
    stackoverflowSignal: new Map(),
    wikipediaPageviews: new Map(),
    openRouterSignal: new Map(),
    groqSignal: new Map(),
    aaLlmIntelligence: new Map(),
    aaImageArena: new Map(),
    aaVideoArena: new Map(),
    lmsysArena: new Map(),
    hfLeaderboard: new Map(),
    githubReleaseFrequency: new Map(),
    githubCommitActivity: new Map(),
    githubIssueResolution: new Map(),
    semanticScholarCitations: new Map(),
    openAlexCitations: new Map(),
    arxivMentionVelocity: new Map(),
    manifoldMarkets: new Map(),
  };

  const signalMapping: [string, keyof RawSignals][] = [
    ['pypi_downloads', 'pypiDownloads'],
    ['npm_downloads', 'npmDownloads'],
    ['huggingface_signal', 'huggingfaceSignal'],
    ['hf_downloads', 'hfDownloads'],
    ['hf_likes', 'hfLikes'],
    ['hf_downloads_velocity', 'hfDownloadsVelocity'],
    ['openwebui_usage', 'openWebUIUsage'],
    ['cloudflare_radar', 'cloudflareRadar'],
    ['ollama_signal', 'ollamaSignal'],
    ['docker_hub_pulls', 'dockerHubPulls'],
    ['modelscope_signal', 'modelscopeSignal'],
    ['github_stars_velocity', 'githubStars'],
    ['github_forks', 'githubForks'],
    ['github_clones', 'githubClones'],
    ['github_views', 'githubViews'],
    ['hackernews_signal', 'hackernewsSignal'],
    ['reddit_signal', 'redditSignal'],
    ['smolai_signal', 'smolaiSignal'],
    ['google_trends_signal', 'googleTrendsSignal'],
    ['stackoverflow_signal', 'stackoverflowSignal'],
    ['wikipedia_pageviews', 'wikipediaPageviews'],
    ['open_router_signal', 'openRouterSignal'],
    ['open_router_usage', 'openRouterUsage'],
    ['groq_signal', 'groqSignal'],
    ['aa_llm_intelligence', 'aaLlmIntelligence'],
    ['aa_image_arena', 'aaImageArena'],
    ['aa_video_arena', 'aaVideoArena'],
    ['lmsys_arena', 'lmsysArena'],
    ['hf_leaderboard', 'hfLeaderboard'],
    ['github_release_frequency', 'githubReleaseFrequency'],
    ['github_commit_activity', 'githubCommitActivity'],
    ['github_issue_resolution', 'githubIssueResolution'],
    ['semantic_scholar_citations', 'semanticScholarCitations'],
    ['open_alex_citations', 'openAlexCitations'],
    ['arxiv_mention_velocity', 'arxivMentionVelocity'],
    ['manifold_markets', 'manifoldMarkets'],
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

  // Snapshot existing scores before overwriting
  const runId = `${today}_${Date.now()}`;
  const existing = await db.execute({
    sql: `SELECT entity_id, date, usage_score, attention_score, capability_score, expert_score, total_score, confidence_lower, confidence_upper
          FROM daily_scores WHERE date = ?`,
    args: [today],
  });
  if (existing.rows.length > 0) {
    const snapStmts = existing.rows.map(row => ({
      sql: `INSERT INTO score_snapshots (run_id, entity_id, date, usage_score, attention_score, capability_score, expert_score, total_score, confidence_lower, confidence_upper)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [runId, row.entity_id, row.date, row.usage_score, row.attention_score, row.capability_score, row.expert_score, row.total_score, row.confidence_lower, row.confidence_upper],
    }));
    await db.batch(snapStmts, 'write');
    console.log(`[scoring] Snapshot ${runId}: backed up ${existing.rows.length} scores`);
  }

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

  return { date: today, entitiesUpdated, anomalies, durationMs: Date.now() - start };
}

/**
 * List available score snapshots, most recent first.
 */
export async function listScoreSnapshots(): Promise<{ run_id: string; created_at: string; count: number }[]> {
  const db = await ensureDb();
  const result = await db.execute(
    `SELECT run_id, MIN(created_at) as created_at, COUNT(*) as cnt
     FROM score_snapshots GROUP BY run_id ORDER BY created_at DESC LIMIT 20`
  );
  return result.rows.map(row => ({
    run_id: row.run_id as string,
    created_at: row.created_at as string,
    count: row.cnt as number,
  }));
}

/**
 * Restore scores from a snapshot, overwriting current daily_scores for that date.
 */
export async function restoreScoreSnapshot(runId: string): Promise<{ restored: number }> {
  const db = await ensureDb();
  const rows = await db.execute({
    sql: `SELECT entity_id, date, usage_score, attention_score, capability_score, expert_score, total_score, confidence_lower, confidence_upper
          FROM score_snapshots WHERE run_id = ?`,
    args: [runId],
  });

  if (rows.rows.length === 0) {
    throw new Error(`Snapshot ${runId} not found`);
  }

  const stmts = rows.rows.map(row => ({
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
    args: [row.entity_id, row.date, row.usage_score, row.attention_score, row.capability_score, row.expert_score, row.total_score, row.confidence_lower, row.confidence_upper],
  }));

  await db.batch(stmts, 'write');
  console.log(`[scoring] Restored snapshot ${runId}: ${rows.rows.length} scores`);
  return { restored: rows.rows.length };
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
