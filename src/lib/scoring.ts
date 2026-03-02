import { getEntityRegistry, getAllEntityIds, type RegisteredEntity, type EntitySources } from './entity-registry';
import { get90DayBaselines } from './db';

export interface RawSignals {
  // usage signals
  pypiDownloads: Map<string, number>;
  npmDownloads: Map<string, number>;
  huggingfaceSignal: Map<string, number>;
  hfDownloads: Map<string, number>;
  hfLikes: Map<string, number>;
  hfDownloadsVelocity: Map<string, number>;
  openRouterUsage: Map<string, number>;
  githubStars: Map<string, number>;
  githubForks: Map<string, number>;
  githubClones: Map<string, number>;
  githubViews: Map<string, number>;
  openWebUIUsage: Map<string, number>;
  cloudflareRadar: Map<string, number>;
  ollamaSignal: Map<string, number>;
  dockerHubPulls: Map<string, number>;
  modelscopeSignal: Map<string, number>;
  // attention signals
  hackernewsSignal: Map<string, number>;
  redditSignal: Map<string, number>;
  smolaiSignal: Map<string, number>;
  googleTrendsSignal: Map<string, number>;
  stackoverflowSignal: Map<string, number>;
  wikipediaPageviews: Map<string, number>;
  // capability signals
  openRouterSignal: Map<string, number>;
  groqSignal: Map<string, number>;
  aaLlmIntelligence: Map<string, number>;
  aaImageArena: Map<string, number>;
  aaVideoArena: Map<string, number>;
  lmsysArena: Map<string, number>;
  hfLeaderboard: Map<string, number>;
  githubReleaseFrequency: Map<string, number>;
  githubCommitActivity: Map<string, number>;
  githubIssueResolution: Map<string, number>;
  // expert signals
  semanticScholarCitations: Map<string, number>;
  openAlexCitations: Map<string, number>;
  arxivMentionVelocity: Map<string, number>;
  manifoldMarkets: Map<string, number>;
}

export interface EntityScores {
  usage_score: number;
  attention_score: number;
  capability_score: number;
  expert_score: number;
  total_score: number;
  confidence: number;
  confidence_lower: number;
  confidence_upper: number;
}

// Signals that participate in scoring (clones/views excluded — require push access)
const SIGNAL_NAMES = [
  'pypiDownloads', 'npmDownloads', 'huggingfaceSignal', 'hfDownloads', 'hfLikes', 'hfDownloadsVelocity',
  'openRouterUsage', 'openWebUIUsage', 'cloudflareRadar', 'ollamaSignal', 'githubStars', 'githubForks',
  'dockerHubPulls',
  'modelscopeSignal',
  'hackernewsSignal', 'redditSignal', 'smolaiSignal', 'googleTrendsSignal', 'stackoverflowSignal',
  'wikipediaPageviews',
  'openRouterSignal',
  'groqSignal',
  'aaLlmIntelligence',
  'aaImageArena',
  'aaVideoArena',
  'lmsysArena',
  'hfLeaderboard',
  'githubReleaseFrequency',
  'githubCommitActivity',
  'githubIssueResolution',
  'semanticScholarCitations',
  'openAlexCitations',
  'arxivMentionVelocity',
  'manifoldMarkets',
] as const;

type SignalName = typeof SIGNAL_NAMES[number];

// Decay half-lives by dimension (in days) — used by baseline computations
export const DECAY_HALF_LIVES: Record<string, number> = {
  usage: 60,
  attention: 21,
  capability: 180,
  expert: 90,
};

export interface DimensionWeights {
  usage: number;
  attention: number;
  capability: number;
  expert: number;
}

const DEFAULT_DIMENSION_WEIGHTS: DimensionWeights = {
  usage: 0.25, attention: 0.30, capability: 0.25, expert: 0.20,
};

const CATEGORY_DIMENSION_WEIGHTS: Partial<Record<string, DimensionWeights>> = {
  agent_tools: { usage: 0.35, attention: 0.35, capability: 0.10, expert: 0.20 },
};

export function getDimensionWeights(category: string): DimensionWeights {
  return CATEGORY_DIMENSION_WEIGHTS[category] ?? DEFAULT_DIMENSION_WEIGHTS;
}

/**
 * Exponential decay weight for a data point of a given age.
 * Returns a value between 0 and 1.
 */
export function exponentialDecay(dayAge: number, halfLife: number): number {
  return Math.pow(2, -dayAge / halfLife);
}

/**
 * Normalize values within a category using log-percentile ranking.
 * log_value = log(1 + raw_value)
 * percentile_rank = rank_within_category / category_size
 * score = percentile_rank * 95
 *
 * This ensures even distribution from 0–95 regardless of raw value skew.
 * When only 1 entity has data, fall back to a fixed mid-range score (47.5).
 */
function normalizeWithinCategory(
  values: Map<string, number>,
  entityIds: string[],
  _signalName: string,
  category: string,
  _baselines: Map<string, { min: number; max: number }>,
  entityRegistry: RegisteredEntity[],
): Map<string, number> {
  const result = new Map<string, number>();

  // Get category entity IDs
  const categoryEntityIds = entityIds.filter(id => {
    const entity = entityRegistry.find(e => e.id === id);
    return entity?.category === category;
  });

  // Collect log-transformed values for entities that have data
  const logValues: { id: string; logVal: number }[] = [];
  for (const id of categoryEntityIds) {
    const raw = values.get(id) ?? 0;
    if (raw > 0) {
      logValues.push({ id, logVal: Math.log(1 + raw) });
    }
  }

  // Sort ascending for percentile ranking
  logValues.sort((a, b) => a.logVal - b.logVal);

  const withData = logValues.length;

  if (withData === 0) {
    // No data at all — everyone gets baseline
    for (const id of categoryEntityIds) {
      result.set(id, 0);
    }
    return result;
  }

  if (withData === 1) {
    // Only 1 entity has data — give it a mid-range score instead of 95
    for (const id of categoryEntityIds) {
      result.set(id, 0);
    }
    result.set(logValues[0].id, 47.5);
    return result;
  }

  // Assign percentile-based scores
  const entityScoreMap = new Map<string, number>();
  for (let i = 0; i < logValues.length; i++) {
    const percentile = (i + 1) / withData; // rank from 1/n to 1.0
    const score = Math.round(percentile * 95 * 100) / 100;
    entityScoreMap.set(logValues[i].id, score);
  }

  // ── Company diversity adjustment ──
  // When a single company has more entities than 35% of the category,
  // apply a graduated penalty to its lowest-ranked excess models.
  // Top models from each company keep full scores.
  const entitiesWithData = logValues.length;
  const maxSlots = Math.max(2, Math.ceil(entitiesWithData * 0.35));

  // Group entities-with-data by company, sorted by score descending
  const companyEntities = new Map<string, { id: string; score: number }[]>();
  for (const { id: eid } of logValues) {
    const ent = entityRegistry.find(e => e.id === eid);
    const company = ent?.company ?? '__unknown__';
    let list = companyEntities.get(company);
    if (!list) {
      list = [];
      companyEntities.set(company, list);
    }
    list.push({ id: eid, score: entityScoreMap.get(eid) ?? 0 });
  }

  companyEntities.forEach((models) => {
    if (models.length <= maxSlots) return;
    // Sort descending so the company's best models are first
    models.sort((a: { score: number }, b: { score: number }) => b.score - a.score);
    const excess = models.length - maxSlots;
    for (let i = maxSlots; i < models.length; i++) {
      // Graduated penalty: linearly from 1.0 down to 0.5 for the last excess model
      const penaltyPosition = i - maxSlots; // 0-based position within excess
      const penaltyFactor = 1.0 - 0.5 * ((penaltyPosition + 1) / excess);
      const original = entityScoreMap.get(models[i].id) ?? 0;
      entityScoreMap.set(models[i].id, Math.round(original * penaltyFactor * 100) / 100);
    }
  });

  for (const id of categoryEntityIds) {
    result.set(id, entityScoreMap.get(id) ?? 0);
  }

  return result;
}

/**
 * Combine multiple normalized signals with sub-weights into a dimension score.
 * Enforces 30% source cap only when 3+ sources contribute for an entity.
 * With 1-2 sources, signals use their full normalized weight.
 *
 * maxSignals: optional cap on how many signals can contribute per entity.
 * When an entity has more contributing signals than the cap, only the top N
 * by weighted contribution (value × weight) are kept. This prevents
 * open-weight models from dominating usage via sheer signal breadth.
 */
function combineDimension(
  signals: { normalized: Map<string, number>; weight: number }[],
  entityIds: string[],
  maxSignals?: number,
): Map<string, number> {
  const result = new Map<string, number>();
  const SOURCE_CAP = 0.30;

  for (const id of entityIds) {
    let totalWeight = 0;
    let contributions: { value: number; weight: number }[] = [];

    for (const signal of signals) {
      const val = signal.normalized.get(id);
      if (val !== undefined && val > 0) {
        contributions.push({ value: val, weight: signal.weight });
        totalWeight += signal.weight;
      }
    }

    if (totalWeight === 0) {
      result.set(id, 5); // baseline for no data
      continue;
    }

    // Cap number of contributing signals — keep top N by contribution
    if (maxSignals !== undefined && contributions.length > maxSignals) {
      contributions.sort((a, b) => (b.value * b.weight) - (a.value * a.weight));
      contributions = contributions.slice(0, maxSignals);
      totalWeight = contributions.reduce((sum, c) => sum + c.weight, 0);
    }

    // Only apply the 30% source cap when 3+ sources contribute
    const applyCap = contributions.length >= 3;

    let weightedSum = 0;

    if (!applyCap) {
      // 1-2 sources: use full normalized weights
      for (const c of contributions) {
        weightedSum += c.value * (c.weight / totalWeight);
      }
    } else {
      // 3+ sources: apply cap and redistribute
      let cappedWeight = 0;
      let uncappedWeight = 0;
      const cappedContribs: { value: number; normalizedWeight: number; capped: boolean }[] = [];

      for (const c of contributions) {
        const normalizedWeight = c.weight / totalWeight;
        const isCapped = normalizedWeight > SOURCE_CAP;
        cappedContribs.push({
          value: c.value,
          normalizedWeight: isCapped ? SOURCE_CAP : normalizedWeight,
          capped: isCapped,
        });
        if (isCapped) {
          cappedWeight += normalizedWeight - SOURCE_CAP;
        } else {
          uncappedWeight += normalizedWeight;
        }
      }

      for (const c of cappedContribs) {
        let finalWeight = c.normalizedWeight;
        if (!c.capped && uncappedWeight > 0 && cappedWeight > 0) {
          finalWeight += (c.normalizedWeight / uncappedWeight) * cappedWeight;
        }
        weightedSum += c.value * finalWeight;
      }
    }

    result.set(id, Math.round(weightedSum * 100) / 100);
  }

  return result;
}

/**
 * Check if an entity is a new entrant (release_date < 14 days ago).
 */
function isNewEntrant(entityId: string, entityRegistry: RegisteredEntity[]): boolean {
  const entity = entityRegistry.find(e => e.id === entityId);
  if (!entity?.release_date) return false;
  const releaseDate = new Date(entity.release_date);
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  return releaseDate > fourteenDaysAgo;
}

/**
 * Calculate signal completeness confidence for an entity.
 *
 * Confidence is measured against *applicable* signals — signals the entity
 * could reasonably have data for, based on its source configuration.
 * A closed-source model with no PyPI/NPM/GitHub isn't penalized for lacking
 * those signals; it's only penalized for missing signals it's configured to have.
 *
 * Universal signals (hackernews, reddit, smolai, semanticScholar, openAlex)
 * apply to all entities. Source-gated signals only count if the entity has
 * that source type configured.
 */
function calculateConfidence(
  entityId: string,
  raw: RawSignals,
  entityRegistry: RegisteredEntity[],
): { confidence: number; lower: number; upper: number } {
  const entity = entityRegistry.find(e => e.id === entityId);
  const sources = entity?.sources;

  // Map of signal → whether it's applicable to this entity
  // Universal signals (any entity could show up in these): always applicable
  // Source-gated signals: only applicable if entity has the source configured
  const signalApplicability: { map: Map<string, number>; applicable: boolean }[] = [
    { map: raw.pypiDownloads, applicable: !!sources?.pypi?.length },
    { map: raw.npmDownloads, applicable: !!sources?.npm?.length },
    { map: raw.huggingfaceSignal, applicable: !!sources?.huggingface?.length },
    { map: raw.hfDownloads, applicable: !!sources?.huggingface?.length },
    { map: raw.hfLikes, applicable: !!sources?.huggingface?.length },
    { map: raw.hfDownloadsVelocity, applicable: !!sources?.huggingface?.length },
    { map: raw.openRouterUsage, applicable: !!sources?.openRouter },
    { map: raw.openWebUIUsage, applicable: !!sources?.openWebUI?.length },
    { map: raw.cloudflareRadar, applicable: !!sources?.cloudflareRadar },
    { map: raw.ollamaSignal, applicable: !!sources?.ollama?.length },
    { map: raw.githubStars, applicable: !!sources?.github?.length },
    { map: raw.githubForks, applicable: !!sources?.github?.length },
    { map: raw.dockerHubPulls, applicable: !!sources?.dockerHub?.length },
    { map: raw.modelscopeSignal, applicable: !!sources?.modelscope?.length },
    // Universal signals — always applicable
    { map: raw.hackernewsSignal, applicable: true },
    { map: raw.redditSignal, applicable: true },
    { map: raw.smolaiSignal, applicable: true },
    { map: raw.googleTrendsSignal, applicable: true },
    { map: raw.stackoverflowSignal, applicable: true },
    { map: raw.wikipediaPageviews, applicable: !!sources?.wikipedia },
    { map: raw.openRouterSignal, applicable: !!sources?.openRouter },
    { map: raw.groqSignal, applicable: !!sources?.groq },
    { map: raw.aaLlmIntelligence, applicable: !!sources?.artificialAnalysis },
    { map: raw.aaImageArena, applicable: !!sources?.artificialAnalysis },
    { map: raw.aaVideoArena, applicable: !!sources?.artificialAnalysis },
    { map: raw.lmsysArena, applicable: !!sources?.lmsysArena },
    { map: raw.hfLeaderboard, applicable: !!sources?.hfLeaderboard },
    { map: raw.githubReleaseFrequency, applicable: !!sources?.github?.length },
    { map: raw.githubCommitActivity, applicable: !!sources?.github?.length },
    { map: raw.githubIssueResolution, applicable: !!sources?.github?.length },
    { map: raw.semanticScholarCitations, applicable: true },
    { map: raw.openAlexCitations, applicable: true },
    { map: raw.arxivMentionVelocity, applicable: !!sources?.arxiv?.length },
    { map: raw.manifoldMarkets, applicable: !!sources?.manifoldMarkets?.length },
  ];

  let available = 0;
  let applicable = 0;
  for (const { map, applicable: isApplicable } of signalApplicability) {
    if (!isApplicable) continue;
    applicable++;
    const val = map.get(entityId);
    if (val !== undefined && val > 0) {
      available++;
    }
  }

  // Floor at 5 to avoid division by tiny numbers for entities with very few sources
  const denominator = Math.max(applicable, 5);
  const confidence = available / denominator;
  const band = (1 - confidence) * 10;

  return { confidence, lower: -band, upper: band };
}

export async function computeScores(raw: RawSignals): Promise<Map<string, EntityScores>> {
  const entityRegistry = await getEntityRegistry();
  const entityIds = await getAllEntityIds();
  const scores = new Map<string, EntityScores>();

  // Group entities by category
  const categoriesMap: Record<string, string[]> = {};
  for (const entity of entityRegistry) {
    if (!categoriesMap[entity.category]) categoriesMap[entity.category] = [];
    categoriesMap[entity.category].push(entity.id);
  }

  // Per-category normalization
  const normalizedSignals: Record<SignalName, Map<string, number>> = {
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

  const signalToRaw: Record<SignalName, Map<string, number>> = {
    pypiDownloads: raw.pypiDownloads,
    npmDownloads: raw.npmDownloads,
    huggingfaceSignal: raw.huggingfaceSignal,
    hfDownloads: raw.hfDownloads,
    hfLikes: raw.hfLikes,
    hfDownloadsVelocity: raw.hfDownloadsVelocity,
    openRouterUsage: raw.openRouterUsage,
    openWebUIUsage: raw.openWebUIUsage,
    cloudflareRadar: raw.cloudflareRadar,
    ollamaSignal: raw.ollamaSignal,
    githubStars: raw.githubStars,
    githubForks: raw.githubForks,
    dockerHubPulls: raw.dockerHubPulls,
    modelscopeSignal: raw.modelscopeSignal,
    hackernewsSignal: raw.hackernewsSignal,
    redditSignal: raw.redditSignal,
    smolaiSignal: raw.smolaiSignal,
    googleTrendsSignal: raw.googleTrendsSignal,
    stackoverflowSignal: raw.stackoverflowSignal,
    wikipediaPageviews: raw.wikipediaPageviews,
    openRouterSignal: raw.openRouterSignal,
    groqSignal: raw.groqSignal,
    aaLlmIntelligence: raw.aaLlmIntelligence,
    aaImageArena: raw.aaImageArena,
    aaVideoArena: raw.aaVideoArena,
    lmsysArena: raw.lmsysArena,
    hfLeaderboard: raw.hfLeaderboard,
    githubReleaseFrequency: raw.githubReleaseFrequency,
    githubCommitActivity: raw.githubCommitActivity,
    githubIssueResolution: raw.githubIssueResolution,
    semanticScholarCitations: raw.semanticScholarCitations,
    openAlexCitations: raw.openAlexCitations,
    arxivMentionVelocity: raw.arxivMentionVelocity,
    manifoldMarkets: raw.manifoldMarkets,
  };

  // Deduplicate shared SDK/package signals before normalization.
  // For each dedup-eligible signal, divides raw values evenly among all
  // entities that reference the same source value (e.g., same pypi package).
  {
    const deduplicationConfig: {
      signal: SignalName;
      getSourceKeys: (sources: EntitySources) => string[] | null;
    }[] = [
      { signal: 'pypiDownloads', getSourceKeys: (s) => s.pypi },
      { signal: 'npmDownloads', getSourceKeys: (s) => s.npm },
      { signal: 'githubStars', getSourceKeys: (s) => s.github },
      { signal: 'githubForks', getSourceKeys: (s) => s.github },
      { signal: 'githubReleaseFrequency', getSourceKeys: (s) => s.github },
      { signal: 'githubCommitActivity', getSourceKeys: (s) => s.github },
      { signal: 'githubIssueResolution', getSourceKeys: (s) => s.github },
      { signal: 'huggingfaceSignal', getSourceKeys: (s) => s.huggingface },
      { signal: 'hfDownloads', getSourceKeys: (s) => s.huggingface },
      { signal: 'hfLikes', getSourceKeys: (s) => s.huggingface },
      { signal: 'hfDownloadsVelocity', getSourceKeys: (s) => s.huggingface },
      { signal: 'cloudflareRadar', getSourceKeys: (s) => s.cloudflareRadar ? [s.cloudflareRadar] : null },
      { signal: 'stackoverflowSignal', getSourceKeys: (s) => s.stackoverflow },
      { signal: 'dockerHubPulls', getSourceKeys: (s) => s.dockerHub },
      { signal: 'modelscopeSignal', getSourceKeys: (s) => s.modelscope },
    ];

    for (const { signal, getSourceKeys } of deduplicationConfig) {
      const rawMap = signalToRaw[signal];

      // Build reverse map: source value → list of entity IDs referencing it
      const sourceToEntities = new Map<string, string[]>();
      for (const entity of entityRegistry) {
        const keys = getSourceKeys(entity.sources);
        if (!keys) continue;
        for (const key of keys) {
          let list = sourceToEntities.get(key);
          if (!list) {
            list = [];
            sourceToEntities.set(key, list);
          }
          list.push(entity.id);
        }
      }

      // For each source value shared by multiple entities, divide the raw value
      sourceToEntities.forEach((entityIdsForSource) => {
        if (entityIdsForSource.length <= 1) return;

        // Get the raw value (all sharing entities have the same raw for this source)
        let rawValue = 0;
        for (const eid of entityIdsForSource) {
          const v = rawMap.get(eid);
          if (v !== undefined && v > 0) {
            rawValue = v;
            break;
          }
        }
        if (rawValue === 0) return;

        const share = rawValue / entityIdsForSource.length;

        // For multi-package entities: subtract this source's full contribution,
        // add back the shared portion. Entity total = sum of per-package shares.
        for (const eid of entityIdsForSource) {
          const currentVal = rawMap.get(eid) ?? 0;
          if (currentVal === 0) continue;
          const newVal = currentVal - rawValue + share;
          rawMap.set(eid, Math.max(0, newVal));
        }
      });
    }
  }

  // ── Outlier clipping ──
  // Clip extreme values within each category to prevent cheap/free-tier
  // models from dominating via automated batch traffic.
  // OpenRouter usage uses P75 because token volume correlates with price
  // (cheap models accumulate 10-100x more tokens from batch jobs).
  {
    const signalsToClip: { signal: SignalName; percentile: number }[] = [
      { signal: 'openRouterUsage', percentile: 0.75 },
    ];
    for (const { signal: signalName, percentile } of signalsToClip) {
      const rawMap = signalToRaw[signalName];
      for (const [, catIds] of Object.entries(categoriesMap)) {
        const vals = catIds
          .map(id => rawMap.get(id) ?? 0)
          .filter(v => v > 0)
          .sort((a, b) => a - b);
        if (vals.length < 5) continue;
        const clipIndex = Math.floor(vals.length * percentile);
        const clipVal = vals[clipIndex];
        for (const id of catIds) {
          const v = rawMap.get(id);
          if (v !== undefined && v > clipVal) {
            rawMap.set(id, clipVal);
          }
        }
      }
    }
  }

  for (const [category] of Object.entries(categoriesMap)) {
    const baselines = await get90DayBaselines(category);

    for (const signalName of SIGNAL_NAMES) {
      const categoryNormalized = normalizeWithinCategory(
        signalToRaw[signalName],
        entityIds,
        signalName,
        category,
        baselines,
        entityRegistry,
      );
      categoryNormalized.forEach((val, id) => {
        normalizedSignals[signalName].set(id, val);
      });
    }
  }

  // ── Combine into dimensions ──
  // Usage: PyPI (0.15) + npm (0.15) + HuggingFace composite (0.08) + HF Downloads (0.05)
  //        + HF Likes (0.04) + HF Download Velocity (0.05) + Cloudflare Radar (0.12)
  //        + OpenRouter Usage (0.12) + OpenWebUI (0.07) + GitHub Stars (0.09) + GitHub Forks (0.08)
  // Note: GitHub clones/views excluded — traffic API requires push access to repos we don't own
  const usageScores = combineDimension([
    { normalized: normalizedSignals.pypiDownloads, weight: 0.12 },
    { normalized: normalizedSignals.npmDownloads, weight: 0.12 },
    { normalized: normalizedSignals.huggingfaceSignal, weight: 0.07 },
    { normalized: normalizedSignals.hfDownloads, weight: 0.04 },
    { normalized: normalizedSignals.hfLikes, weight: 0.03 },
    { normalized: normalizedSignals.hfDownloadsVelocity, weight: 0.04 },
    { normalized: normalizedSignals.cloudflareRadar, weight: 0.10 },
    { normalized: normalizedSignals.openRouterUsage, weight: 0.10 },
    { normalized: normalizedSignals.ollamaSignal, weight: 0.11 },
    { normalized: normalizedSignals.openWebUIUsage, weight: 0.06 },
    { normalized: normalizedSignals.githubStars, weight: 0.08 },
    { normalized: normalizedSignals.githubForks, weight: 0.08 },
    { normalized: normalizedSignals.dockerHubPulls, weight: 0.05 },
    { normalized: normalizedSignals.modelscopeSignal, weight: 0.04 },
  ], entityIds, 8);

  // Attention: HackerNews (0.25) + Reddit (0.20) + Google Trends (0.16) + SO (0.12)
  //            + Wikipedia (0.07) + SmolAI (0.10) + Manifold Markets (0.10)
  const attentionScores = combineDimension([
    { normalized: normalizedSignals.hackernewsSignal, weight: 0.25 },
    { normalized: normalizedSignals.redditSignal, weight: 0.20 },
    { normalized: normalizedSignals.googleTrendsSignal, weight: 0.16 },
    { normalized: normalizedSignals.stackoverflowSignal, weight: 0.12 },
    { normalized: normalizedSignals.wikipediaPageviews, weight: 0.07 },
    { normalized: normalizedSignals.smolaiSignal, weight: 0.10 },
    { normalized: normalizedSignals.manifoldMarkets, weight: 0.10 },
  ], entityIds);

  // Capability: OpenRouter (0.20) + Groq (0.15) + AA LLM Intelligence (0.20)
  //             + AA Image Arena (0.10) + AA Video Arena (0.08)
  //             + LMSYS Arena (0.15) + HF Leaderboard (0.12)
  const capabilityScores = combineDimension([
    { normalized: normalizedSignals.openRouterSignal, weight: 0.20 },
    { normalized: normalizedSignals.groqSignal, weight: 0.15 },
    { normalized: normalizedSignals.aaLlmIntelligence, weight: 0.20 },
    { normalized: normalizedSignals.aaImageArena, weight: 0.10 },
    { normalized: normalizedSignals.aaVideoArena, weight: 0.08 },
    { normalized: normalizedSignals.lmsysArena, weight: 0.15 },
    { normalized: normalizedSignals.hfLeaderboard, weight: 0.12 },
    { normalized: normalizedSignals.githubReleaseFrequency, weight: 0.06 },
    { normalized: normalizedSignals.githubCommitActivity, weight: 0.05 },
    { normalized: normalizedSignals.githubIssueResolution, weight: 0.06 },
  ], entityIds);

  // Expert: Semantic Scholar (0.38) + OpenAlex (0.38) + arXiv Velocity (0.24)
  const expertScores = combineDimension([
    { normalized: normalizedSignals.semanticScholarCitations, weight: 0.38 },
    { normalized: normalizedSignals.openAlexCitations, weight: 0.38 },
    { normalized: normalizedSignals.arxivMentionVelocity, weight: 0.24 },
  ], entityIds);

  // ── Apply recency decay to attention and usage ──
  // Older models shouldn't dominate just from accumulated metrics.
  // recency_factor = max(0.5, 1 - (days_since_release / 730))
  for (const id of entityIds) {
    const entity = entityRegistry.find(e => e.id === id);
    if (entity?.release_date) {
      const daysSinceRelease = (Date.now() - new Date(entity.release_date).getTime()) / (1000 * 60 * 60 * 24);
      const recencyFactor = Math.max(0.5, 1 - daysSinceRelease / 730);

      const usage = usageScores.get(id);
      if (usage !== undefined) {
        usageScores.set(id, Math.round(usage * recencyFactor * 100) / 100);
      }

      const attention = attentionScores.get(id);
      if (attention !== undefined) {
        attentionScores.set(id, Math.round(attention * recencyFactor * 100) / 100);
      }
    }
  }

  // ── App entities inherit capability from their parent model (90% discount) ──
  for (const id of entityIds) {
    const entity = entityRegistry.find(e => e.id === id);
    if (entity?.category !== 'app' || !entity.parent_model) continue;
    const parentCap = capabilityScores.get(entity.parent_model);
    if (parentCap !== undefined && parentCap > 5) {
      capabilityScores.set(id, Math.round(parentCap * 0.90 * 100) / 100);
    }
  }

  // ── Attention-capability coherence check ──
  // Dampen attention scores that are disproportionately high compared to
  // capability. Genuine top models have correlated attention and capability;
  // inflated attention from generic search terms (e.g., "minimax" matching
  // the CS algorithm) shows as high attention with mediocre capability.
  // Only applies when attention exceeds capability by more than 25 points.
  // Skipped for agent_tools — their capability is structurally low (no benchmarks),
  // so dampening would incorrectly penalize legitimate attention.
  for (const id of entityIds) {
    const entity = entityRegistry.find(e => e.id === id);
    if (entity?.category === 'agent_tools') continue;
    const attention = attentionScores.get(id) ?? 5;
    const capability = capabilityScores.get(id) ?? 5;
    const gap = attention - capability;
    if (gap > 25) {
      // Dampen excess attention: keep capability + 25, blend remainder at 50%
      const dampened = capability + 25 + (gap - 25) * 0.5;
      attentionScores.set(id, Math.round(dampened * 100) / 100);
    }
  }

  // Compute category medians for new entrant handling
  const categoryMedians: Record<string, number> = {};
  for (const [category, catIds] of Object.entries(categoriesMap)) {
    const totals: number[] = [];
    for (const id of catIds) {
      if (!isNewEntrant(id, entityRegistry)) {
        const usage = usageScores.get(id) ?? 5;
        const attention = attentionScores.get(id) ?? 5;
        const capability = capabilityScores.get(id) ?? 5;
        const expert = expertScores.get(id) ?? 5;
        const w = getDimensionWeights(category);
        totals.push(w.usage * usage + w.attention * attention + w.capability * capability + w.expert * expert);
      }
    }
    totals.sort((a, b) => a - b);
    categoryMedians[category] = totals.length > 0 ? totals[Math.floor(totals.length / 2)] : 30;
  }

  // ── Final composite ──
  for (const id of entityIds) {
    const entity = entityRegistry.find(e => e.id === id);
    const usage = usageScores.get(id) ?? 5;
    const attention = attentionScores.get(id) ?? 5;
    const capability = capabilityScores.get(id) ?? 5;
    const expert = expertScores.get(id) ?? 5;

    const w = getDimensionWeights(entity?.category ?? 'general_llm');
    let total = Math.round((w.usage * usage + w.attention * attention + w.capability * capability + w.expert * expert) * 100) / 100;

    // New entrants start at category median
    if (isNewEntrant(id, entityRegistry) && entity) {
      total = categoryMedians[entity.category] ?? total;
    }

    const { confidence, lower, upper } = calculateConfidence(id, raw, entityRegistry);

    // ── Confidence discount ──
    // Penalize total score when signal coverage is low.
    // Maps confidence 0→1 to a discount factor of 0.6→1.0 (linear).
    // An entity with 50% signal coverage gets 80% of its raw total;
    // one with full coverage keeps 100%.
    const confidenceDiscount = 0.6 + 0.4 * confidence;
    total = Math.round(total * confidenceDiscount * 100) / 100;

    scores.set(id, {
      usage_score: usage,
      attention_score: attention,
      capability_score: capability,
      expert_score: expert,
      total_score: total,
      confidence,
      confidence_lower: Math.max(0, Math.round((total + lower) * 100) / 100),
      confidence_upper: Math.min(100, Math.round((total + upper) * 100) / 100),
    });
  }

  return scores;
}
