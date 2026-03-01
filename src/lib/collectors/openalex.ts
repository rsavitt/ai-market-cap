import { getEntityRegistry } from '../entity-registry';
import { delay } from './fetch-utils';

interface OpenAlexWork {
  id: string;
  title: string;
  cited_by_count: number;
}

interface OpenAlexResponse {
  results: OpenAlexWork[];
}

export async function collectOpenAlex(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();
  const apiKey = process.env.OPENALEX_API_KEY;

  // Deduplicate queries — same pattern as Semantic Scholar collector
  const queryToEntities = new Map<string, string[]>();
  for (const entity of entityRegistry) {
    const queries = entity.sources.semanticScholar;
    if (!queries || queries.length === 0) continue;
    for (const query of queries) {
      if (!queryToEntities.has(query)) queryToEntities.set(query, []);
      queryToEntities.get(query)!.push(entity.id);
    }
  }

  // Cache query results so we only fetch each unique query once
  const queryScores = new Map<string, number>();

  const BATCH_SIZE = 5;

  async function processQuery(query: string) {
    try {
      const params = new URLSearchParams({
        'filter': `title.search:${query}`,
        'per_page': '3',
        'select': 'id,title,cited_by_count',
      });
      if (apiKey) {
        params.set('api_key', apiKey);
      }

      const res = await fetch(
        `https://api.openalex.org/works?${params}`,
        {
          headers: { 'User-Agent': 'ai-market-cap (https://github.com/raelisavitt/ai-market-cap)' },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!res.ok) {
        console.log(`[openalex] HTTP ${res.status} for "${query}"`);
        return;
      }

      const data = (await res.json()) as OpenAlexResponse;
      let maxCitations = 0;
      for (const work of data.results ?? []) {
        maxCitations = Math.max(maxCitations, work.cited_by_count ?? 0);
      }

      queryScores.set(query, maxCitations);
    } catch {
      // timeout or network error — skip this query
    }
  }

  const allQueries = Array.from(queryToEntities.keys());

  for (let i = 0; i < allQueries.length; i += BATCH_SIZE) {
    const batch = allQueries.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(processQuery));
    if (i + BATCH_SIZE < allQueries.length) {
      await delay(100);
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
