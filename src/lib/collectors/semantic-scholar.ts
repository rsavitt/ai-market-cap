import { getEntityRegistry } from '../entity-registry';
import { delay } from './fetch-utils';

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
  const queryToEntities = new Map<string, string[]>();
  for (const entity of entityRegistry) {
    const queries = entity.sources.semanticScholar;
    if (!queries || queries.length === 0) continue;
    for (const query of queries) {
      if (!queryToEntities.has(query)) queryToEntities.set(query, []);
      queryToEntities.get(query)!.push(entity.id);
    }
  }

  const allQueries = Array.from(queryToEntities.keys());
  if (allQueries.length === 0) return results;

  // Without API key: 100 req/5min. Sequential with adaptive delay.
  // With API key: much higher limits, can batch.
  const baseDelayMs = apiKey ? 200 : 3500;
  let currentDelayMs = baseDelayMs;

  // Cache query results so we only fetch each unique query once
  const queryScores = new Map<string, number>();

  async function processQuery(query: string): Promise<'ok' | 'rate_limited' | 'error'> {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
          // Check Retry-After header, otherwise use exponential backoff
          const retryAfter = res.headers.get('Retry-After');
          let waitMs: number;
          if (retryAfter) {
            const seconds = parseInt(retryAfter, 10);
            waitMs = isNaN(seconds) ? 10000 : Math.min(seconds * 1000, 60000);
          } else {
            waitMs = Math.min(5000 * Math.pow(2, attempt), 30000);
          }
          console.log(`[semantic-scholar] Rate limited on "${query}", waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${maxAttempts})...`);
          await delay(waitMs);
          continue;
        }

        if (!res.ok) return 'error';

        const data = await res.json() as S2SearchResponse;
        let maxCitations = 0;
        for (const paper of data.data ?? []) {
          const score = (paper.citationCount ?? 0) + (paper.influentialCitationCount ?? 0) * 5;
          maxCitations = Math.max(maxCitations, score);
        }

        queryScores.set(query, maxCitations);
        return 'ok';
      } catch {
        return 'error';
      }
    }
    return 'rate_limited';
  }

  if (apiKey) {
    // With API key: batch 3 at a time with short delays
    for (let i = 0; i < allQueries.length; i += 3) {
      const batch = allQueries.slice(i, i + 3);
      await Promise.all(batch.map(processQuery));
      if (i + 3 < allQueries.length) {
        await delay(currentDelayMs);
      }
    }
  } else {
    // Without API key: sequential with adaptive delay
    let consecutiveRateLimits = 0;

    for (const query of allQueries) {
      if (consecutiveRateLimits >= 5) {
        console.log(`[semantic-scholar] Stopping after ${consecutiveRateLimits} consecutive rate limits. Got ${queryScores.size}/${allQueries.length} queries.`);
        break;
      }

      const result = await processQuery(query);

      if (result === 'ok') {
        consecutiveRateLimits = 0;
        // Gradually reduce delay back toward baseline after successes
        currentDelayMs = Math.max(baseDelayMs, currentDelayMs * 0.8);
      } else if (result === 'rate_limited') {
        consecutiveRateLimits++;
        // Increase inter-request delay on rate limits
        currentDelayMs = Math.min(currentDelayMs * 1.5, 15000);
        console.log(`[semantic-scholar] Increasing delay to ${Math.round(currentDelayMs)}ms`);
      } else {
        // Non-rate-limit errors don't count toward consecutive limit
        consecutiveRateLimits = 0;
      }

      await delay(currentDelayMs);
    }
  }

  console.log(`[semantic-scholar] Fetched ${queryScores.size}/${allQueries.length} unique queries`);

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
