import { getAllEntityIds } from './entity-registry';

export interface RawSignals {
  // usage signals
  pypiDownloads: Map<string, number>;
  npmDownloads: Map<string, number>;
  huggingfaceSignal: Map<string, number>;
  githubStars: Map<string, number>;
  // attention signals
  hackernewsSignal: Map<string, number>;
  redditSignal: Map<string, number>;
  // capability signals
  artificialAnalysisScore: Map<string, number>;
  // expert signals
  semanticScholarCitations: Map<string, number>;
}

export interface EntityScores {
  usage_score: number;
  attention_score: number;
  capability_score: number;
  expert_score: number;
  total_score: number;
}

/**
 * Convert raw values to percentile ranks (0-100).
 * Entities not in the map get a score of 0.
 */
function percentileRank(values: Map<string, number>, entityIds: string[]): Map<string, number> {
  const result = new Map<string, number>();

  // Collect all values with entity IDs
  const entries: { id: string; value: number }[] = [];
  for (const id of entityIds) {
    entries.push({ id, value: values.get(id) ?? 0 });
  }

  // Sort ascending
  entries.sort((a, b) => a.value - b.value);

  const n = entries.length;
  if (n === 0) return result;

  // Assign percentile ranks (handle ties with average rank)
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && entries[j].value === entries[i].value) j++;
    const avgRank = (i + j - 1) / 2;
    const percentile = Math.round((avgRank / (n - 1)) * 100);
    for (let k = i; k < j; k++) {
      result.set(entries[k].id, n === 1 ? 50 : percentile);
    }
    i = j;
  }

  return result;
}

/**
 * Combine multiple percentile-ranked signals with sub-weights into a dimension score.
 * Missing signals are ignored (weight redistributed).
 */
function combineDimension(
  signals: { percentiles: Map<string, number>; weight: number }[],
  entityIds: string[],
): Map<string, number> {
  const result = new Map<string, number>();

  for (const id of entityIds) {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const val = signal.percentiles.get(id);
      if (val !== undefined && val > 0) {
        weightedSum += val * signal.weight;
        totalWeight += signal.weight;
      }
    }

    // If entity has no data for any signal in this dimension, give baseline score
    result.set(id, totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : 5);
  }

  return result;
}

export function computeScores(raw: RawSignals): Map<string, EntityScores> {
  const entityIds = getAllEntityIds();
  const scores = new Map<string, EntityScores>();

  // ── Percentile rank each raw signal ──
  const pypiPct = percentileRank(raw.pypiDownloads, entityIds);
  const npmPct = percentileRank(raw.npmDownloads, entityIds);
  const hfPct = percentileRank(raw.huggingfaceSignal, entityIds);
  const ghPct = percentileRank(raw.githubStars, entityIds);
  const hnPct = percentileRank(raw.hackernewsSignal, entityIds);
  const redditPct = percentileRank(raw.redditSignal, entityIds);
  const aaPct = percentileRank(raw.artificialAnalysisScore, entityIds);
  const ssPct = percentileRank(raw.semanticScholarCitations, entityIds);

  // ── Combine into dimensions ──
  // Usage: PyPI (0.30) + npm (0.30) + HuggingFace (0.25) + GitHub (0.15)
  const usageScores = combineDimension([
    { percentiles: pypiPct, weight: 0.30 },
    { percentiles: npmPct, weight: 0.30 },
    { percentiles: hfPct, weight: 0.25 },
    { percentiles: ghPct, weight: 0.15 },
  ], entityIds);

  // Attention: HackerNews (0.55) + Reddit (0.45)
  const attentionScores = combineDimension([
    { percentiles: hnPct, weight: 0.55 },
    { percentiles: redditPct, weight: 0.45 },
  ], entityIds);

  // Capability: Artificial Analysis (0.70) + HN expert signal (0.30)
  const capabilityScores = combineDimension([
    { percentiles: aaPct, weight: 0.70 },
    { percentiles: hnPct, weight: 0.30 }, // High-point HN stories correlate with capability
  ], entityIds);

  // Expert: Semantic Scholar (0.50) + Artificial Analysis (0.30) + HN (0.20)
  const expertScores = combineDimension([
    { percentiles: ssPct, weight: 0.50 },
    { percentiles: aaPct, weight: 0.30 },
    { percentiles: hnPct, weight: 0.20 },
  ], entityIds);

  // ── Final composite ──
  for (const id of entityIds) {
    const usage = usageScores.get(id) ?? 5;
    const attention = attentionScores.get(id) ?? 5;
    const capability = capabilityScores.get(id) ?? 5;
    const expert = expertScores.get(id) ?? 5;
    const total = Math.round((0.45 * usage + 0.30 * attention + 0.15 * capability + 0.10 * expert) * 100) / 100;

    scores.set(id, { usage_score: usage, attention_score: attention, capability_score: capability, expert_score: expert, total_score: total });
  }

  return scores;
}
