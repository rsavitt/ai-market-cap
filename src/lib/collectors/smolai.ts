import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry } from './fetch-utils';

/** Normalize a string for tag matching: lowercase, spaces→hyphens */
function normalizeForTagMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Collect AI "buzz" signal from https://news.smol.ai/
 *
 * Scrapes the /issues/ page, extracts tags from recent posts (last 7 days),
 * and counts how many tag mentions match each entity's search terms.
 */
export async function collectSmolAI(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  const res = await fetchWithRetry(
    'https://news.smol.ai/issues/',
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) {
    throw new Error(`smol.ai responded with ${res.status}`);
  }

  const html = await res.text();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Each card: <div class="group relative arrow-card">...</div>
  // Contains: <time datetime="2026-02-25T05:44:39.731Z">
  // Tags: <span class="rounded-sm border border-blue-300 ...">tag-name</span>
  //   inside <div class="mt-1 inline-flex flex-wrap gap-1">

  // Split by arrow-card boundaries to get individual cards
  const cardSplits = html.split(/arrow-card/);

  const recentTags: string[] = [];

  // Skip first split (before first card)
  for (let i = 1; i < cardSplits.length; i++) {
    const card = cardSplits[i];

    // Extract ISO date from <time datetime="...">
    const timeMatch = card.match(/<time\s+datetime="([^"]+)"/);
    if (!timeMatch) continue;

    const postDate = new Date(timeMatch[1]);
    if (isNaN(postDate.getTime()) || postDate < thirtyDaysAgo) continue;

    // Extract tags from blue-bordered spans
    // Tags look like: <span class="rounded-sm border border-blue-300 ...">tag-name</span>
    const tagRegex = /border-blue-300[^>]*>\s*([^<]+)\s*<\/span>/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(card)) !== null) {
      const tag = tagMatch[1].trim().toLowerCase();
      if (tag.length > 0) {
        recentTags.push(tag);
      }
    }
  }

  if (recentTags.length === 0) {
    console.log('[smolai] No recent tags found');
    return results;
  }

  console.log(`[smolai] Found ${recentTags.length} tags from recent posts`);

  // Match entity search terms against collected tags
  for (const entity of entityRegistry) {
    const searchTerms = entity.sources.smolai;
    if (!searchTerms || searchTerms.length === 0) continue;

    const normalizedTerms = searchTerms.map(normalizeForTagMatch);
    let count = 0;
    for (const tag of recentTags) {
      for (const term of normalizedTerms) {
        if (tag.includes(term)) {
          count++;
          break; // Don't double-count same tag for multiple terms
        }
      }
    }

    if (count > 0) {
      results.set(entity.id, count);
    }
  }

  return results;
}
