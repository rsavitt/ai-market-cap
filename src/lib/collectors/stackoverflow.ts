import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry, delay } from './fetch-utils';

interface StackExchangeResponse {
  total: number;
}

/**
 * Collect Stack Overflow question counts.
 *
 * Uses the Stack Exchange API v2.3 with `filter=total` to get question
 * counts matching each entity's search terms. Sums across all queries.
 *
 * Rate limit: 300 req/day without key, 10k with STACKEXCHANGE_KEY.
 */
export async function collectStackOverflow(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  const apiKey = process.env.STACKEXCHANGE_KEY;

  for (const entity of entityRegistry) {
    if (!entity.sources.stackoverflow?.length) continue;

    let totalQuestions = 0;

    for (const query of entity.sources.stackoverflow) {
      try {
        const params = new URLSearchParams({
          intitle: query,
          site: 'stackoverflow',
          filter: 'total',
        });
        if (apiKey) {
          params.set('key', apiKey);
        }

        const res = await fetchWithRetry(
          `https://api.stackexchange.com/2.3/search?${params}`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (!res.ok) continue;

        const data = await res.json() as StackExchangeResponse;
        totalQuestions += data.total ?? 0;
      } catch {
        // Skip failed queries
      }
      await delay(200);
    }

    if (totalQuestions > 0) {
      results.set(entity.id, totalQuestions);
    }
  }

  return results;
}
