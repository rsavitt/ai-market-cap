import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry } from './fetch-utils';

interface HfLeaderboardEntry {
  model: {
    name: string;
    average_score: number;
  };
}

const HF_LEADERBOARD_URL =
  'https://open-llm-leaderboard-open-llm-leaderboard.hf.space/api/leaderboard/formatted';

/**
 * Collect HuggingFace Open LLM Leaderboard average scores.
 *
 * Fetches the public REST API which returns ~4500 models with
 * their benchmark evaluation results. We use `model.average_score`
 * (0-100 range) as the capability signal.
 */
export async function collectHfLeaderboard(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const result = new Map<string, number>();

  // Build reverse map: HF model name → entity ID
  const hfToEntity = new Map<string, string>();
  for (const entity of entityRegistry) {
    if (entity.sources.hfLeaderboard) {
      hfToEntity.set(entity.sources.hfLeaderboard, entity.id);
    }
  }

  if (hfToEntity.size === 0) {
    return result;
  }

  const res = await fetchWithRetry(
    HF_LEADERBOARD_URL,
    {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000),
    },
  );

  if (!res.ok) {
    throw new Error(`HF leaderboard API returned ${res.status}`);
  }

  const data: HfLeaderboardEntry[] = await res.json();

  for (const entry of data) {
    const modelName = entry.model?.name;
    const score = entry.model?.average_score;
    if (!modelName || score == null || score <= 0) continue;

    const entityId = hfToEntity.get(modelName);
    if (entityId) {
      // Keep highest score if multiple entries match (different precisions/SHAs)
      const existing = result.get(entityId) ?? 0;
      if (score > existing) {
        result.set(entityId, score);
      }
    }
  }

  return result;
}
