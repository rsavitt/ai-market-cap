import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry, delay } from './fetch-utils';

interface HNSearchResponse {
  nbHits: number;
  hits: { points: number | null; num_comments: number | null }[];
}

export async function collectHackerNews(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  // Search last 7 days
  const weekAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);

  for (const entity of entityRegistry) {
    let totalPoints = 0;
    let totalHits = 0;

    for (const query of entity.sources.hackernews) {
      try {
        const params = new URLSearchParams({
          query,
          tags: 'story',
          numericFilters: `created_at_i>${weekAgo}`,
          hitsPerPage: '50',
        });
        const res = await fetchWithRetry(
          `https://hn.algolia.com/api/v1/search?${params}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) continue;

        const data = await res.json() as HNSearchResponse;
        totalHits += data.nbHits ?? 0;
        for (const hit of data.hits) {
          totalPoints += hit.points ?? 0;
        }
      } catch {
        // Skip failed queries
      }
      await delay(200);
    }

    // Combine hit count and points: points are the primary signal
    const signal = totalPoints + totalHits * 2;
    if (signal > 0) {
      results.set(entity.id, signal);
    }
  }

  return results;
}
