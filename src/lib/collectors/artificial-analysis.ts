import { getEntityRegistry } from '../entity-registry';

interface AAModel {
  model_id: string;
  intelligence_index?: number;
  elo_score?: number;
  mmlu_score?: number;
}

export async function collectArtificialAnalysis(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();
  const apiKey = process.env.ARTIFICIAL_ANALYSIS_KEY;

  // Build reverse map: AA model ID → entity ID
  const aaIdToEntity = new Map<string, string>();
  for (const entity of entityRegistry) {
    if (entity.sources.artificialAnalysis) {
      aaIdToEntity.set(entity.sources.artificialAnalysis, entity.id);
    }
  }

  if (aaIdToEntity.size === 0) return results;

  try {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(
      'https://artificialanalysis.ai/api/v2/data/llms/models',
      { headers, signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return results;

    const models = await res.json() as AAModel[];

    for (const model of models) {
      const entityId = aaIdToEntity.get(model.model_id);
      if (!entityId) continue;

      // Combine intelligence index and elo score as capability signal
      const score = (model.intelligence_index ?? 0) * 10 + (model.elo_score ?? 0);
      if (score > 0) {
        results.set(entityId, score);
      }
    }
  } catch {
    // API unavailable — return empty
  }

  return results;
}
