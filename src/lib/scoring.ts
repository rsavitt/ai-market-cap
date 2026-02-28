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
  artificialAnalysisScore: Map<string, number>;
  openRouterSignal: Map<string, number>;
  // expert signals
  semanticScholarCitations: Map<string, number>;
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
  'artificialAnalysisScore', 'openRouterSignal',
  'semanticScholarCitations',
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
 * Normalize values within a category using 90-day rolling baselines.
 * score = ((value - min_90d) / (max_90d - min_90d)) * 95
 * Leader capped at 95, floor at 0.
 */
function normalizeWithinCategory(
  values: Map<string, number>,
  entityIds: string[],
  signalName: string,
  category: string,
  baselines: Map<string, { min: number; max: number }>,
  entityRegistry: RegisteredEntity[],
): Map<string, number> {
  const result = new Map<string, number>();
  const baseline = baselines.get(signalName);

  // Get category entity IDs
  const categoryEntityIds = entityIds.filter(id => {
    const entity = entityRegistry.find(e => e.id === id);
    return entity?.category === category;
  });

  for (const id of categoryEntityIds) {
    const value = values.get(id) ?? 0;

    if (baseline && baseline.max > baseline.min) {
      const normalized = ((value - baseline.min) / (baseline.max - baseline.min)) * 95;
      result.set(id, Math.max(0, Math.min(95, Math.round(normalized * 100) / 100)));
    } else {
      // No baseline range — use raw value capped at 95
      result.set(id, Math.min(95, Math.max(0, value)));
    }
  }

  return result;
}

/**
 * Combine multiple normalized signals with sub-weights into a dimension score.
 * Enforces 30% source cap: if any single signal exceeds 30% of the dimension weight,
 * clamp and redistribute.
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

    // Normalize weights and apply 30% cap
    let weightedSum = 0;
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

    // Redistribute capped weight to uncapped signals
    for (const c of cappedContribs) {
      let finalWeight = c.normalizedWeight;
      if (!c.capped && uncappedWeight > 0 && cappedWeight > 0) {
        finalWeight += (c.normalizedWeight / uncappedWeight) * cappedWeight;
      }
      weightedSum += c.value * finalWeight;
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
    raw.artificialAnalysisScore, raw.openRouterSignal,
    raw.semanticScholarCitations,
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
    artificialAnalysisScore: new Map(),
    openRouterSignal: new Map(),
    semanticScholarCitations: new Map(),
  };

  const signalToRaw: Record<SignalName, Map<string, number>> = {
    pypiDownloads: raw.pypiDownloads,
    npmDownloads: raw.npmDownloads,
    huggingfaceSignal: raw.huggingfaceSignal,
    openRouterUsage: raw.openRouterUsage,
    githubStars: raw.githubStars,
    hackernewsSignal: raw.hackernewsSignal,
    redditSignal: raw.redditSignal,
    artificialAnalysisScore: raw.artificialAnalysisScore,
    openRouterSignal: raw.openRouterSignal,
    semanticScholarCitations: raw.semanticScholarCitations,
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

  // Capability: Artificial Analysis (0.50) + OpenRouter (0.30) + HN expert signal (0.20)
  const capabilityScores = combineDimension([
    { normalized: normalizedSignals.artificialAnalysisScore, weight: 0.50 },
    { normalized: normalizedSignals.openRouterSignal, weight: 0.30 },
    { normalized: normalizedSignals.hackernewsSignal, weight: 0.20 },
  ], entityIds);

  // Expert: Semantic Scholar (0.50) + Artificial Analysis (0.30) + HN (0.20)
  const expertScores = combineDimension([
    { normalized: normalizedSignals.semanticScholarCitations, weight: 0.50 },
    { normalized: normalizedSignals.artificialAnalysisScore, weight: 0.30 },
    { normalized: normalizedSignals.hackernewsSignal, weight: 0.20 },
  ], entityIds);

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
