import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry, delay } from './fetch-utils';

/**
 * Collect Wikipedia pageviews for the last 30 days.
 * API: Wikimedia REST API (no auth required).
 * Returns Map<entityId, totalViews>.
 */
export async function collectWikipediaPageviews(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();
  const titleToEntities = new Map<string, string[]>();

  // Build reverse map: article title → entity IDs
  for (const entity of entityRegistry) {
    if (!entity.sources.wikipedia) continue;
    const title = entity.sources.wikipedia;
    const existing = titleToEntities.get(title) || [];
    existing.push(entity.id);
    titleToEntities.set(title, existing);
  }

  // Calculate date range: last 30 days
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const startStr = start.toISOString().slice(0, 10).replace(/-/g, '');
  const endStr = end.toISOString().slice(0, 10).replace(/-/g, '');

  for (const [title, entityIds] of Array.from(titleToEntities.entries())) {
    try {
      const encodedTitle = encodeURIComponent(title);
      const res = await fetchWithRetry(
        `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodedTitle}/daily/${startStr}00/${endStr}00`,
        { headers: { 'Accept': 'application/json', 'User-Agent': 'AIMarketCap/1.0' }, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;

      const data = await res.json() as { items?: { views: number }[] };
      const totalViews = (data.items ?? []).reduce((sum, item) => sum + (item.views ?? 0), 0);

      for (const entityId of entityIds) {
        results.set(entityId, (results.get(entityId) || 0) + totalViews);
      }
    } catch {
      // Skip failed titles silently
    }
    await delay(200);
  }

  return results;
}
