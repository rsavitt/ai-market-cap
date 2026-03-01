import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry, delay } from './fetch-utils';

/** Normalize a string for tag matching: lowercase, spaces→hyphens */
function normalizeForTagMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-');
}

/** Max issue pages to fetch per collection run */
const MAX_ISSUES = 10;

/** Delay between issue page fetches (ms) */
const FETCH_DELAY_MS = 500;

/**
 * Extract recent issue URLs from the smol.ai /issues/ index page.
 * Returns URLs for issues published within the last 30 days, newest first.
 */
function extractRecentIssueUrls(html: string, maxAge: Date): string[] {
  const cardSplits = html.split(/arrow-card/);
  const urls: string[] = [];

  for (let i = 1; i < cardSplits.length; i++) {
    const card = cardSplits[i];

    const timeMatch = card.match(/<time\s+datetime="([^"]+)"/);
    if (!timeMatch) continue;

    const postDate = new Date(timeMatch[1]);
    if (isNaN(postDate.getTime()) || postDate < maxAge) continue;

    // Extract issue URL from the card's link
    const hrefMatch = card.match(/<a\s[^>]*href="(\/issues\/[^"]+)"/);
    if (!hrefMatch) continue;

    urls.push(hrefMatch[1]);
  }

  return urls;
}

/**
 * Count weighted mentions of entity search terms in an issue page's HTML.
 *
 * - Bold/strong mentions (<strong>): weight 2
 * - Tag links (/tags/...): weight 1
 * - Plain body text mentions: weight 1
 */
function countMentions(
  html: string,
  searchTerms: string[],
): number {
  if (searchTerms.length === 0) return 0;

  let total = 0;

  // Extract bold text segments and count matches (weight 2)
  const strongRegex = /<strong[^>]*>([\s\S]*?)<\/strong>/gi;
  let match: RegExpExecArray | null;
  const boldTexts: string[] = [];
  while ((match = strongRegex.exec(html)) !== null) {
    // Strip any nested HTML tags from bold content
    const text = match[1].replace(/<[^>]+>/g, '').toLowerCase();
    boldTexts.push(text);
  }

  // Extract tag links (href="/tags/...") and collect tag names (weight 1)
  const tagRegex = /href="\/tags\/([^"]+)"/gi;
  const tagNames: string[] = [];
  while ((match = tagRegex.exec(html)) !== null) {
    tagNames.push(match[1].toLowerCase());
  }

  // Get plain body text: strip all HTML, lowercase
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase();

  for (const term of searchTerms) {
    const normalizedTerm = normalizeForTagMatch(term);
    const lowerTerm = term.toLowerCase();

    // Bold mentions (weight 2)
    for (const boldText of boldTexts) {
      if (boldText.includes(lowerTerm) || boldText.includes(normalizedTerm)) {
        total += 2;
      }
    }

    // Tag mentions (weight 1)
    for (const tag of tagNames) {
      if (tag.includes(normalizedTerm)) {
        total += 1;
      }
    }

    // Plain body text mentions (weight 1) — count occurrences
    // Use both forms (spaces and hyphens) for matching
    const escapedTerm = lowerTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedNorm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = escapedTerm === escapedNorm
      ? escapedTerm
      : `(?:${escapedTerm}|${escapedNorm})`;
    const bodyRegex = new RegExp(pattern, 'gi');
    const bodyMatches = bodyText.match(bodyRegex);
    if (bodyMatches) {
      total += bodyMatches.length;
    }
  }

  return total;
}

/**
 * Collect AI "buzz" signal from https://news.smol.ai/
 *
 * Fetches recent issue pages (last 30 days, up to 10), parses full article
 * bodies for entity mentions with prominence weighting:
 *   - Bold/heading mentions: 2x
 *   - Tag metadata: 1x
 *   - Plain text mentions: 1x
 */
export async function collectSmolAI(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  // Step 1: Fetch the index page to get recent issue URLs
  const indexRes = await fetchWithRetry(
    'https://news.smol.ai/issues/',
    { signal: AbortSignal.timeout(15000) },
  );
  if (!indexRes.ok) {
    throw new Error(`smol.ai responded with ${indexRes.status}`);
  }

  const indexHtml = await indexRes.text();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const issueUrls = extractRecentIssueUrls(indexHtml, thirtyDaysAgo)
    .slice(0, MAX_ISSUES);

  if (issueUrls.length === 0) {
    console.log('[smolai] No recent issues found');
    return results;
  }

  console.log(`[smolai] Found ${issueUrls.length} recent issues to fetch`);

  // Step 2: Fetch each issue page with rate limiting
  const issueHtmls: string[] = [];
  for (const url of issueUrls) {
    const fullUrl = `https://news.smol.ai${url}`;
    try {
      const res = await fetchWithRetry(
        fullUrl,
        { signal: AbortSignal.timeout(30000) },
      );
      if (res.ok) {
        issueHtmls.push(await res.text());
      } else {
        console.log(`[smolai] Failed to fetch ${url}: ${res.status}`);
      }
    } catch (err) {
      console.log(`[smolai] Error fetching ${url}: ${err}`);
    }

    // Rate-limit: wait between requests
    if (issueUrls.indexOf(url) < issueUrls.length - 1) {
      await delay(FETCH_DELAY_MS);
    }
  }

  console.log(`[smolai] Successfully fetched ${issueHtmls.length} issue pages`);

  // Step 3 & 4: Parse mentions and aggregate per entity
  for (const entity of entityRegistry) {
    const searchTerms = entity.sources.smolai;
    if (!searchTerms || searchTerms.length === 0) continue;

    let entityTotal = 0;
    for (const issueHtml of issueHtmls) {
      entityTotal += countMentions(issueHtml, searchTerms);
    }

    if (entityTotal > 0) {
      results.set(entity.id, entityTotal);
    }
  }

  return results;
}
