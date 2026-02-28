import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry } from './fetch-utils';

interface GroqModel {
  id: string;
  context_window?: number;
  max_completion_tokens?: number;
  owned_by?: string;
}

const MAX_CONTEXT_LENGTH = 256_000;
const MAX_COMPLETION_TOKENS = 128_000;

export async function collectGroq(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  // Build reverse map: Groq model ID → entity ID
  const groqIdToEntity = new Map<string, string>();
  for (const entity of entityRegistry) {
    if (entity.sources.groq) {
      groqIdToEntity.set(entity.sources.groq, entity.id);
    }
  }

  if (groqIdToEntity.size === 0) return results;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return results;

  try {
    const res = await fetchWithRetry(
      'https://api.groq.com/openai/v1/models',
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) return results;

    const body = await res.json() as { data: GroqModel[] };
    const models = body.data;

    for (const model of models) {
      const entityId = groqIdToEntity.get(model.id);
      if (!entityId) continue;

      // Context length score (50% weight) — normalized against 256K
      const contextLength = model.context_window ?? 0;
      const contextScore = Math.min(contextLength / MAX_CONTEXT_LENGTH, 1) * 100;

      // Output capability score (50% weight) — max_completion_tokens normalized against 128K
      const maxCompletionTokens = model.max_completion_tokens ?? 0;
      const outputScore = Math.min(maxCompletionTokens / MAX_COMPLETION_TOKENS, 1) * 100;

      const score = contextScore * 0.5 + outputScore * 0.5;

      if (score > 0) {
        results.set(entityId, Math.round(score * 100) / 100);
      }
    }
  } catch {
    // API unavailable — return empty
  }

  return results;
}
