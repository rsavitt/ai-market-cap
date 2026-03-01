import { getEntityRegistry } from '../entity-registry';

interface S2SearchResponse {
  total: number;
  data: { citationCount: number; influentialCitationCount: number }[];
}

export async function collectSemanticScholar(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  // Deduplicate queries — many entities share papers
  // Map each unique query to the entity IDs that reference it
  const queryToEntities = new Map<string, string[]>();
  for (const entity of entityRegistry) {
    const queries = entity.sources.semanticScholar;
    if (!queries || queries.length === 0) continue;
    for (const query of queries) {
      if (!queryToEntities.has(query)) queryToEntities.set(query, []);
      queryToEntities.get(query)!.push(entity.id);
    }
  }

  // Without API key: 100 req/5min ≈ 1 req/3s. Use 3.5s to stay safe.
  // With API key: much higher limits, use 200ms.
  const delayMs = apiKey ? 200 : 3500;
  let consecutiveRateLimits = 0;

  // Cache query results so we only fetch each unique query once
  const queryScores = new Map<string, number>();

  const BATCH_SIZE = apiKey ? 3 : 2;

  async function processQuery(query: string): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const params = new URLSearchParams({
          query,
          limit: '3',
          fields: 'citationCount,influentialCitationCount',
        });
        const res = await fetch(
          `https://api.semanticscholar.org/graph/v1/paper/search?${params}`,
          { headers, signal: AbortSignal.timeout(10000) }
        );

        if (res.status === 429) {
          console.log(`[semantic-scholar] Rate limited on "${query}", waiting 60s...`);
          await new Promise(r => setTimeout(r, 60000));
          continue; // retry
        }

        if (!res.ok) return false;

        const data = await res.json() as S2SearchResponse;
        let maxCitations = 0;
        for (const paper of data.data ?? []) {
          const score = (paper.citationCount ?? 0) + (paper.influentialCitationCount ?? 0) * 5;
          maxCitations = Math.max(maxCitations, score);
        }

        queryScores.set(query, maxCitations);
        return true;
      } catch {
        return false; // timeout or unavailable
      }
    }
    return false;
  }

  const allQueries = Array.from(queryToEntities.keys());

  for (let i = 0; i < allQueries.length; i += BATCH_SIZE) {
    if (consecutiveRateLimits >= 3) {
      console.log(`[semantic-scholar] Stopping early after ${consecutiveRateLimits} consecutive rate limits. Got ${queryScores.size} query results.`);
      break;
    }

    const batch = allQueries.slice(i, i + BATCH_SIZE);
    const results_batch = await Promise.all(batch.map(processQuery));

    for (const success of results_batch) {
      if (success) {
        consecutiveRateLimits = 0;
      } else {
        consecutiveRateLimits++;
      }
    }

    if (i + BATCH_SIZE < allQueries.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // Aggregate: sum scores across all queries for each entity
  for (const entity of entityRegistry) {
    const queries = entity.sources.semanticScholar;
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
