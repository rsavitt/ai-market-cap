import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry } from './fetch-utils';

/**
 * Collect LMSYS Chatbot Arena ELO ratings from arena.ai.
 *
 * Scrapes https://arena.ai/leaderboard/text which embeds all leaderboard
 * entries as JSON in Next.js RSC streaming format. We extract
 * modelDisplayName + rating pairs via regex.
 */
export async function collectLmsysArena(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const result = new Map<string, number>();

  // Build reverse map: LMSYS model name → entity ID
  const lmsysToEntity = new Map<string, string>();
  for (const entity of entityRegistry) {
    if (entity.sources.lmsysArena) {
      lmsysToEntity.set(entity.sources.lmsysArena, entity.id);
    }
  }

  if (lmsysToEntity.size === 0) {
    return result;
  }

  const res = await fetchWithRetry(
    'https://arena.ai/leaderboard/text',
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIMarketCap/1.0)' },
      signal: AbortSignal.timeout(30000),
    },
  );

  if (!res.ok) {
    throw new Error(`arena.ai returned ${res.status}`);
  }

  const html = await res.text();

  // The HTML contains escaped JSON in Next.js RSC format.
  // Entries appear as: \"modelDisplayName\":\"<name>\",\"rating\":<number>
  const entryPattern = /\\"modelDisplayName\\":\\"([^\\]+)\\",\\"rating\\":(\d+)/g;

  // Collect all entries — keep the first (highest) rating per model name,
  // since the text/overall leaderboard entries appear first on this page.
  const seen = new Map<string, number>();
  let match;
  while ((match = entryPattern.exec(html)) !== null) {
    const modelName = match[1];
    const rating = parseInt(match[2], 10);
    if (!seen.has(modelName)) {
      seen.set(modelName, rating);
    }
  }

  // Map to entity IDs
  seen.forEach((rating, modelName) => {
    const entityId = lmsysToEntity.get(modelName);
    if (entityId && rating > 0) {
      // Keep highest rating if entity matches multiple model names
      const existing = result.get(entityId) ?? 0;
      if (rating > existing) {
        result.set(entityId, rating);
      }
    }
  });

  return result;
}
