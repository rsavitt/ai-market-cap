import { getEntityRegistry } from '../entity-registry';
import { delay } from './fetch-utils';

interface ManifoldMarket {
  uniqueBettorCount?: number;
}

/**
 * Collect Manifold Markets signal: total unique bettors across open
 * prediction markets mentioning a model.
 *
 * API: https://api.manifold.markets/v0/search-markets (free, no auth, JSON)
 * Rate: 1 req/sec to be polite (no documented limit)
 */
export async function collectManifoldMarkets(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  // Deduplicate queries across entities
  const queryToEntities = new Map<string, string[]>();
  for (const entity of entityRegistry) {
    const queries = entity.sources.manifoldMarkets;
    if (!queries || queries.length === 0) continue;
    for (const query of queries) {
      if (!queryToEntities.has(query)) queryToEntities.set(query, []);
      queryToEntities.get(query)!.push(entity.id);
    }
  }

  const allQueries = Array.from(queryToEntities.keys());
  if (allQueries.length === 0) return results;

  const queryScores = new Map<string, number>();

  for (const query of allQueries) {
    try {
      const params = new URLSearchParams({
        term: query,
        filter: 'open',
        sort: 'most-popular',
        limit: '10',
      });
      const url = `https://api.manifold.markets/v0/search-markets?${params}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

      if (!res.ok) {
        console.log(`[manifold-markets] HTTP ${res.status} for "${query}"`);
        await delay(1000);
        continue;
      }

      const markets = await res.json() as ManifoldMarket[];

      let totalBettors = 0;
      for (const market of markets) {
        totalBettors += market.uniqueBettorCount ?? 0;
      }

      queryScores.set(query, totalBettors);
    } catch (err) {
      console.log(`[manifold-markets] Error for "${query}": ${err}`);
    }

    await delay(1000);
  }

  console.log(`[manifold-markets] Fetched ${queryScores.size}/${allQueries.length} unique queries`);

  // Aggregate: sum scores across all queries for each entity
  for (const entity of entityRegistry) {
    const queries = entity.sources.manifoldMarkets;
    if (!queries || queries.length === 0) continue;

    let total = 0;
    for (const query of queries) {
      total += queryScores.get(query) ?? 0;
    }

    if (total > 0) {
      results.set(entity.id, total);
    }
  }

  return results;
}
