import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry, delay } from './fetch-utils';

interface RadarDomainResponse {
  success: boolean;
  result: {
    details_0: {
      rank: number;
      bucket: string;
    };
  };
}

/**
 * Collect Cloudflare Radar domain popularity rankings.
 *
 * Uses the free Radar API to look up each entity's domain rank based on
 * DNS query volume to 1.1.1.1. Returns an inverted score so higher = more
 * popular: score = 1_000_001 - rank (or bucket midpoint for unranked domains).
 *
 * Requires a CLOUDFLARE_API_TOKEN env var (free Cloudflare account).
 */
export async function collectCloudflareRadar(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) {
    console.log('[cloudflare-radar] No CLOUDFLARE_API_TOKEN set, skipping');
    return results;
  }

  // Deduplicate domains across entities
  const domainToEntities = new Map<string, string[]>();
  for (const entity of entityRegistry) {
    if (!entity.sources.cloudflareRadar) continue;
    const domain = entity.sources.cloudflareRadar;
    const existing = domainToEntities.get(domain) || [];
    existing.push(entity.id);
    domainToEntities.set(domain, existing);
  }

  console.log(`[cloudflare-radar] API token present (${apiToken.length} chars), ${domainToEntities.size} domains to check`);

  for (const [domain, entityIds] of Array.from(domainToEntities.entries())) {
    try {
      const res = await fetchWithRetry(
        `https://api.cloudflare.com/client/v4/radar/ranking/domain/${encodeURIComponent(domain)}`,
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!res.ok) continue;

      const data = await res.json() as RadarDomainResponse;
      if (!data.success) continue;

      const details = data.result?.details_0;
      if (!details) continue;

      // Use exact rank if available, otherwise use bucket value
      let rank: number;
      if (details.rank && details.rank > 0) {
        rank = details.rank;
      } else if (details.bucket) {
        // Bucket is a string like "2000", "5000", or ">200000" for very low ranks
        const cleaned = details.bucket.replace(/[^0-9]/g, '');
        rank = parseInt(cleaned, 10);
        if (isNaN(rank) || rank <= 0) continue;
      } else {
        continue;
      }

      // Invert so higher = more popular (aligns with our scoring where bigger = better)
      // Max bucket is 1,000,000 so use 1,000,001 as ceiling
      const score = 1_000_001 - rank;

      for (const entityId of entityIds) {
        results.set(entityId, score);
      }
    } catch {
      // Skip failed domains
    }
    await delay(200);
  }

  return results;
}
