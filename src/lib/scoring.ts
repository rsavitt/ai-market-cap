import { getEntityRegistry, getAllEntityIds, type RegisteredEntity } from './entity-registry';
import { get90DayBaselines } from './db';

export interface RawSignals {
  // usage signals
  pypiDownloads: Map<string, number>;
  npmDownloads: Map<string, number>;
  huggingfaceSignal: Map<string, number>;
  openRouterUsage: Map<string, number>;
  githubStars: Map<string, number>;
  // attention signals
  hackernewsSignal: Map<string, number>;
  redditSignal: Map<string, number>;
  // capability signals
  openRouterSignal: Map<string, number>;
  // expert signals
  semanticScholarCitations: Map<string, number>;
  openAlexCitations: Map<string, number>;
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

// Signal-to-dimension mapping for counting available signals per entity
const SIGNAL_NAMES = [
  'pypiDownloads', 'npmDownloads', 'huggingfaceSignal', 'openRouterUsage', 'githubStars',
  'hackernewsSignal', 'redditSignal',
  'openRouterSignal',
  'semanticScholarCitations',
  'openAlexCitations',
] as const;

type SignalName = typeof SIGNAL_NAMES[number];

// Decay half-lives by dimension (in days) — used by baseline computations
export const DECAY_HALF_LIVES: Record<string, number> = {
  usage: 60,
  attention: 21,
  capability: 180,
  expert: 90,
};

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

  for (const id of categoryEntityIds) {
    result.set(id, entityScoreMap.get(id) ?? 0);
  }

  return result;
}

/**
 * Combine multiple normalized signals with sub-weights into a dimension score.
 * Enforces 30% source cap only when 3+ sources contribute for an entity.
 * With 1-2 sources, signals use their full normalized weight.
 */
function combineDimension(
  signals: { normalized: Map<string, number>; weight: number }[],
  entityIds: string[],
): Map<string, number> {
  const result = new Map<string, number>();
  const SOURCE_CAP = 0.30;

  for (const id of entityIds) {
    let totalWeight = 0;
    const contributions: { value: number; weight: number }[] = [];

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
 */
function calculateConfidence(entityId: string, raw: RawSignals): { confidence: number; lower: number; upper: number } {
  const signalMaps: Map<string, number>[] = [
    raw.pypiDownloads, raw.npmDownloads, raw.huggingfaceSignal, raw.openRouterUsage, raw.githubStars,
    raw.hackernewsSignal, raw.redditSignal,
    raw.openRouterSignal,
    raw.semanticScholarCitations,
    raw.openAlexCitations,
  ];

  let available = 0;
  for (const map of signalMaps) {
    const val = map.get(entityId);
    if (val !== undefined && val > 0) {
      available++;
    }
  }

  const confidence = available / SIGNAL_NAMES.length;
  const band = (1 - confidence) * 10;

  return { confidence, lower: -band, upper: band }; // offsets from total_score
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
    openRouterUsage: new Map(),
    githubStars: new Map(),
    hackernewsSignal: new Map(),
    redditSignal: new Map(),
    openRouterSignal: new Map(),
    semanticScholarCitations: new Map(),
    openAlexCitations: new Map(),
  };

  const signalToRaw: Record<SignalName, Map<string, number>> = {
    pypiDownloads: raw.pypiDownloads,
    npmDownloads: raw.npmDownloads,
    huggingfaceSignal: raw.huggingfaceSignal,
    openRouterUsage: raw.openRouterUsage,
    githubStars: raw.githubStars,
    hackernewsSignal: raw.hackernewsSignal,
    redditSignal: raw.redditSignal,
    openRouterSignal: raw.openRouterSignal,
    semanticScholarCitations: raw.semanticScholarCitations,
    openAlexCitations: raw.openAlexCitations,
  };

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
  // Usage: PyPI (0.25) + npm (0.25) + HuggingFace (0.20) + OpenRouter Usage (0.20) + GitHub (0.10)
  const usageScores = combineDimension([
    { normalized: normalizedSignals.pypiDownloads, weight: 0.25 },
    { normalized: normalizedSignals.npmDownloads, weight: 0.25 },
    { normalized: normalizedSignals.huggingfaceSignal, weight: 0.20 },
    { normalized: normalizedSignals.openRouterUsage, weight: 0.20 },
    { normalized: normalizedSignals.githubStars, weight: 0.10 },
  ], entityIds);

  // Attention: HackerNews (0.55) + Reddit (0.45)
  const attentionScores = combineDimension([
    { normalized: normalizedSignals.hackernewsSignal, weight: 0.55 },
    { normalized: normalizedSignals.redditSignal, weight: 0.45 },
  ], entityIds);

  // Capability: OpenRouter (1.0) — the only real capability signal
  const capabilityScores = combineDimension([
    { normalized: normalizedSignals.openRouterSignal, weight: 1.0 },
  ], entityIds);

  // Expert: Semantic Scholar (0.5) + OpenAlex (0.5)
  const expertScores = combineDimension([
    { normalized: normalizedSignals.semanticScholarCitations, weight: 0.5 },
    { normalized: normalizedSignals.openAlexCitations, weight: 0.5 },
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
        totals.push(0.45 * usage + 0.30 * attention + 0.15 * capability + 0.10 * expert);
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

    let total = Math.round((0.45 * usage + 0.30 * attention + 0.15 * capability + 0.10 * expert) * 100) / 100;

    // New entrants start at category median
    if (isNewEntrant(id, entityRegistry) && entity) {
      total = categoryMedians[entity.category] ?? total;
    }

    const { confidence, lower, upper } = calculateConfidence(id, raw);

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
