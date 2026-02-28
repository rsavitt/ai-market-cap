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

  // Deduplicate queries — many entities share the same paper (e.g., all Claude models → "The Claude 3 Model Family")
  const queryToEntities = new Map<string, string[]>();
  for (const entity of entityRegistry) {
    if (!entity.sources.semanticScholar) continue;
    const query = entity.sources.semanticScholar;
    if (!queryToEntities.has(query)) queryToEntities.set(query, []);
    queryToEntities.get(query)!.push(entity.id);
  }

  // Without API key: 100 req/5min ≈ 1 req/3s. Use 3.5s to stay safe.
  // With API key: much higher limits, use 200ms.
  const delayMs = apiKey ? 200 : 3500;
  let consecutiveRateLimits = 0;

  for (const [query, entityIds] of Array.from(queryToEntities.entries())) {
    // If we've hit too many consecutive rate limits, stop early
    if (consecutiveRateLimits >= 3) {
      console.log(`[semantic-scholar] Stopping early after ${consecutiveRateLimits} consecutive rate limits. Got ${results.size} results.`);
      break;
    }

    let success = false;
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

        if (!res.ok) break;

        const data = await res.json() as S2SearchResponse;
        let maxCitations = 0;
        for (const paper of data.data ?? []) {
          const score = (paper.citationCount ?? 0) + (paper.influentialCitationCount ?? 0) * 5;
          maxCitations = Math.max(maxCitations, score);
        }

        if (maxCitations > 0) {
          for (const id of entityIds) {
            results.set(id, maxCitations);
          }
        }

        success = true;
        break;
      } catch {
        break; // timeout or unavailable
      }
    }

    if (success) {
      consecutiveRateLimits = 0;
    } else {
      consecutiveRateLimits++;
    }

    await new Promise(r => setTimeout(r, delayMs));
  }

  return results;
}
