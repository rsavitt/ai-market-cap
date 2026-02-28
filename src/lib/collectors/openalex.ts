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
    if (!entity.sources.semanticScholar) continue;
    const query = entity.sources.semanticScholar;
    if (!queryToEntities.has(query)) queryToEntities.set(query, []);
    queryToEntities.get(query)!.push(entity.id);
  }

  for (const [query, entityIds] of Array.from(queryToEntities.entries())) {
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
        await delay(100);
        continue;
      }

      const data = (await res.json()) as OpenAlexResponse;
      let maxCitations = 0;
      for (const work of data.results ?? []) {
        maxCitations = Math.max(maxCitations, work.cited_by_count ?? 0);
      }

      if (maxCitations > 0) {
        for (const id of entityIds) {
          results.set(id, maxCitations);
        }
      }
    } catch {
      // timeout or network error — skip this query
    }

    await delay(100);
  }

  return results;
}
