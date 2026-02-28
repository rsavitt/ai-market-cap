import { getEntityRegistry } from '../entity-registry';

interface OpenRouterModel {
  id: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
  };
  architecture?: {
    output_modalities?: string[];
  };
}

const MAX_CONTEXT_LENGTH = 200_000;
const MAX_COMPLETION_TOKENS = 128_000;
const MAX_COMPLETION_COST = 0.0001; // $0.0001 per token — anything above is "expensive"

export async function collectOpenRouter(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  // Build reverse map: OpenRouter model ID → entity ID
  const orIdToEntity = new Map<string, string>();
  for (const entity of entityRegistry) {
    if (entity.sources.openRouter) {
      orIdToEntity.set(entity.sources.openRouter, entity.id);
    }
  }

  if (orIdToEntity.size === 0) return results;

  try {
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(
      'https://openrouter.ai/api/v1/models',
      { headers, signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return results;

    const body = await res.json() as { data: OpenRouterModel[] };
    const models = body.data;

    for (const model of models) {
      const entityId = orIdToEntity.get(model.id);
      if (!entityId) continue;

      // Context length score (40% weight) — normalized against max
      const contextLength = model.context_length ?? 0;
      const contextScore = Math.min(contextLength / MAX_CONTEXT_LENGTH, 1) * 100;

      // Pricing efficiency score (30% weight) — inverse of completion cost
      const completionCost = parseFloat(model.pricing?.completion ?? '0');
      const pricingScore = completionCost > 0
        ? Math.min(MAX_COMPLETION_COST / completionCost, 1) * 100
        : 0;

      // Output capability score (20% weight) — max completion tokens
      const maxCompletionTokens = model.top_provider?.max_completion_tokens ?? 0;
      const outputScore = Math.min(maxCompletionTokens / MAX_COMPLETION_TOKENS, 1) * 100;

      // Modality count score (10% weight)
      const modalityCount = model.architecture?.output_modalities?.length ?? 1;
      const modalityScore = Math.min(modalityCount / 3, 1) * 100;

      const score = contextScore * 0.4 + pricingScore * 0.3 + outputScore * 0.2 + modalityScore * 0.1;

      if (score > 0) {
        results.set(entityId, Math.round(score * 100) / 100);
      }
    }
  } catch {
    // API unavailable — return empty
  }

  return results;
}
