import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry } from './fetch-utils';

const API_URL = 'https://api.openwebui.com/api/v1/stats/leaderboard/models/trend';

interface TrendEntry {
  date: string;
  models: Record<string, number>;
}

interface TrendResponse {
  trend: TrendEntry[];
}

/**
 * Collect community usage data from OpenWebUI's public leaderboard.
 * Sums message counts per model over the past month of trend data.
 *
 * Entity matching uses `entity.sources.openWebUI` which contains
 * model name patterns (e.g. "claude-haiku-4-5" matches "claude-haiku-4-5-20251001").
 */
export async function collectOpenWebUI(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  // Build reverse map: pattern → entity ID
  const patternToEntity: { pattern: string; entityId: string }[] = [];
  for (const entity of entityRegistry) {
    if (!entity.sources.openWebUI) continue;
    for (const pattern of entity.sources.openWebUI) {
      patternToEntity.push({ pattern: pattern.toLowerCase(), entityId: entity.id });
    }
  }

  if (patternToEntity.length === 0) return results;

  const res = await fetchWithRetry(
    `${API_URL}?period=month`,
    { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) return results;

  const body = await res.json() as TrendResponse;
  if (!body.trend || !Array.isArray(body.trend)) return results;

  // Sum message counts across all days for each model
  const modelTotals = new Map<string, number>();
  for (const entry of body.trend) {
    for (const [model, count] of Object.entries(entry.models)) {
      const key = model.toLowerCase();
      modelTotals.set(key, (modelTotals.get(key) ?? 0) + count);
    }
  }

  // Match models to entities via substring patterns
  modelTotals.forEach((totalMessages, modelName) => {
    for (const { pattern, entityId } of patternToEntity) {
      if (modelName.includes(pattern) || pattern.includes(modelName)) {
        const current = results.get(entityId) ?? 0;
        results.set(entityId, current + totalMessages);
      }
    }
  });

  return results;
}
