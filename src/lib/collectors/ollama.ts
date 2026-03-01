import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry, delay } from './fetch-utils';

/**
 * Collect Ollama library pull counts.
 *
 * For each entity with `ollama` sources, fetches the model page at
 * ollama.com/library/{model} and extracts the pull count.
 * Sums across all model slugs for multi-model entities.
 */
export async function collectOllama(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  // Build slug → entity mapping to deduplicate requests
  const slugToEntities = new Map<string, string[]>();
  for (const entity of entityRegistry) {
    if (!entity.sources.ollama) continue;
    for (const slug of entity.sources.ollama) {
      const existing = slugToEntities.get(slug) || [];
      existing.push(entity.id);
      slugToEntities.set(slug, existing);
    }
  }

  for (const [slug, entityIds] of Array.from(slugToEntities.entries())) {
    try {
      const res = await fetchWithRetry(
        `https://ollama.com/library/${encodeURIComponent(slug)}`,
        {
          headers: { 'Accept': 'text/html' },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!res.ok) continue;

      const html = await res.text();
      const pulls = parsePullCount(html);
      if (pulls <= 0) continue;

      for (const entityId of entityIds) {
        results.set(entityId, (results.get(entityId) || 0) + pulls);
      }
    } catch {
      // Skip failed slugs
    }
    await delay(200);
  }

  return results;
}

/**
 * Parse pull count from Ollama library page HTML.
 * Looks for patterns like "1.2M Pulls", "523K Pulls", "12,345 Pulls".
 */
export function parsePullCount(html: string): number {
  // Match patterns like "1.2M Pulls", "523K Pulls", "12,345 Pulls"
  const match = html.match(/([\d,.]+)\s*([KMBkmb])?\s*[Pp]ulls/);
  if (!match) return 0;

  const numStr = match[1].replace(/,/g, '');
  let value = parseFloat(numStr);
  if (isNaN(value)) return 0;

  const suffix = (match[2] || '').toUpperCase();
  if (suffix === 'K') value *= 1_000;
  else if (suffix === 'M') value *= 1_000_000;
  else if (suffix === 'B') value *= 1_000_000_000;

  return Math.round(value);
}
