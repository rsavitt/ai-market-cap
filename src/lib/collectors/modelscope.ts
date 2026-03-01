import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry, delay } from './fetch-utils';

/**
 * Collect ModelScope (modelscope.cn) download counts.
 *
 * For each entity with `modelscope` sources, fetches model metadata via
 * the public API and extracts download counts. Sums across all model IDs
 * for multi-model entities.
 */
export async function collectModelScope(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  // Build modelId → entity mapping to deduplicate requests
  const modelToEntities = new Map<string, string[]>();
  for (const entity of entityRegistry) {
    if (!entity.sources.modelscope) continue;
    for (const modelId of entity.sources.modelscope) {
      const existing = modelToEntities.get(modelId) || [];
      existing.push(entity.id);
      modelToEntities.set(modelId, existing);
    }
  }

  for (const [modelId, entityIds] of Array.from(modelToEntities.entries())) {
    try {
      const res = await fetchWithRetry(
        `https://modelscope.cn/api/v1/models/${modelId}`,
        {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!res.ok) continue;

      const data = await res.json();
      const downloads = parseModelScopeResponse(data);
      if (downloads <= 0) continue;

      for (const entityId of entityIds) {
        results.set(entityId, (results.get(entityId) || 0) + downloads);
      }
    } catch {
      // Skip failed models
    }
    await delay(300);
  }

  return results;
}

/**
 * Parse download count from ModelScope API response.
 * Response shape: { Code: 200, Data: { Downloads: number, ... }, Success: true }
 */
export function parseModelScopeResponse(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const obj = data as Record<string, unknown>;
  if (obj.Code !== 200 || !obj.Success) return 0;

  const modelData = obj.Data as Record<string, unknown> | undefined;
  if (!modelData) return 0;

  const downloads = modelData.Downloads;
  if (typeof downloads !== 'number' || isNaN(downloads)) return 0;

  return Math.max(0, Math.round(downloads));
}
