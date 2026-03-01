import { getEntityRegistry } from '../entity-registry';
import { delay } from './fetch-utils';

/**
 * Collect arXiv mention velocity: number of papers mentioning a model
 * in their abstract over the last 30 days, scoped to AI/ML categories.
 *
 * API: http://export.arxiv.org/api/query (free, no auth, Atom XML)
 * Rate limit: 1 request per 3 seconds (we use 3.5s to be safe)
 */
export async function collectArxiv(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  // Build date range: last 30 days in YYYYMMDD format
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const formatDate = (d: Date) =>
    d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, '0') +
    d.getDate().toString().padStart(2, '0');

  const dateFrom = formatDate(thirtyDaysAgo);
  const dateTo = formatDate(now);

  // Deduplicate queries across entities
  const queryToEntities = new Map<string, string[]>();
  for (const entity of entityRegistry) {
    const queries = entity.sources.arxiv;
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
      // Build arXiv API query URL
      // abs:"query" AND (cat:cs.AI OR cat:cs.LG OR cat:cs.CL) AND submittedDate:[from TO to]
      const searchQuery = `abs:"${query}"+AND+(cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL)+AND+submittedDate:[${dateFrom}0000+TO+${dateTo}2359]`;
      const url = `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchQuery)}&max_results=0`;

      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

      if (!res.ok) {
        console.log(`[arxiv] HTTP ${res.status} for "${query}"`);
        await delay(3500);
        continue;
      }

      const xml = await res.text();

      // Extract <opensearch:totalResults> from Atom XML via regex
      const match = xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/);
      const totalResults = match ? parseInt(match[1], 10) : 0;

      queryScores.set(query, totalResults);
    } catch (err) {
      console.log(`[arxiv] Error for "${query}": ${err}`);
    }

    await delay(3500);
  }

  console.log(`[arxiv] Fetched ${queryScores.size}/${allQueries.length} unique queries`);

  // Aggregate: sum scores across all queries for each entity
  for (const entity of entityRegistry) {
    const queries = entity.sources.arxiv;
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
