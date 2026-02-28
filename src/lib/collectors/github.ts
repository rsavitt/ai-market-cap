import { getEntityRegistry } from '../entity-registry';
import { getRawSignalValue } from '../db';
import { fetchWithRetry, delay } from './fetch-utils';

interface GitHubRepo {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

/**
 * Collect GitHub stars and return velocity (7-day delta) instead of absolute count.
 * Absolute count is still stored in raw_signals by the collection pipeline.
 * On first run (no history), falls back to absolute count.
 */
export async function collectGitHub(): Promise<{ velocity: Map<string, number>; absolute: Map<string, number> }> {
  const entityRegistry = await getEntityRegistry();
  const velocity = new Map<string, number>();
  const absolute = new Map<string, number>();
  const token = process.env.GITHUB_TOKEN;

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  for (const entity of entityRegistry) {
    if (!entity.sources.github) continue;

    let totalStars = 0;

    for (const repo of entity.sources.github) {
      try {
        const res = await fetchWithRetry(
          `https://api.github.com/repos/${repo}`,
          { headers, signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) continue;

        const data = await res.json() as GitHubRepo;
        totalStars += data.stargazers_count ?? 0;
      } catch {
        // Skip failed repos
      }
      await delay(200);
    }

    if (totalStars > 0) {
      absolute.set(entity.id, totalStars);

      // Compute velocity: today's stars minus 7 days ago
      const stars7dAgo = await getRawSignalValue(entity.id, 'github_stars', 7);
      if (stars7dAgo !== null) {
        velocity.set(entity.id, totalStars - stars7dAgo);
      } else {
        // Graceful degradation: use absolute count if no history
        velocity.set(entity.id, totalStars);
      }
    }
  }

  return { velocity, absolute };
}
