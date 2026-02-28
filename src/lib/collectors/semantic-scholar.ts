import { getEntityRegistry } from '../entity-registry';

interface S2SearchResponse {
  total: number;
  data: { citationCount: number; influentialCitationCount: number }[];
}

export async function collectSemanticScholar(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  for (const entity of entityRegistry) {
    if (!entity.sources.semanticScholar) continue;

    try {
      const params = new URLSearchParams({
        query: entity.sources.semanticScholar,
        limit: '3',
        fields: 'citationCount,influentialCitationCount',
      });
      const res = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/search?${params}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;

      const data = await res.json() as S2SearchResponse;
      let maxCitations = 0;
      for (const paper of data.data ?? []) {
        const score = (paper.citationCount ?? 0) + (paper.influentialCitationCount ?? 0) * 5;
        maxCitations = Math.max(maxCitations, score);
      }

      if (maxCitations > 0) {
        results.set(entity.id, maxCitations);
      }
    } catch {
      // Skip — rate limited or unavailable
    }

    // Semantic Scholar has aggressive rate limits (100 req/5min without key)
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}
