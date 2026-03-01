import { getEntityRegistry } from '../entity-registry';
import { getRawSignalValue } from '../db';
import { fetchWithRetry, delay } from './fetch-utils';

interface GitHubRepo {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

interface TrafficData {
  count: number;
  uniques: number;
}

export interface GitHubResult {
  velocity: Map<string, number>;
  absolute: Map<string, number>;
  forks: Map<string, number>;
  forksVelocity: Map<string, number>;
  clones: Map<string, number>;
  views: Map<string, number>;
}

/**
 * Collect GitHub stars, forks, and traffic data.
 * Stars velocity and forks velocity are 7-day deltas.
 * Traffic (clones/views) requires push access — gracefully skipped on 403.
 */
export async function collectGitHub(): Promise<GitHubResult> {
  const entityRegistry = await getEntityRegistry();
  const velocity = new Map<string, number>();
  const absolute = new Map<string, number>();
  const forks = new Map<string, number>();
  const forksVelocity = new Map<string, number>();
  const clones = new Map<string, number>();
  const views = new Map<string, number>();
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
    let totalForks = 0;
    let totalClones = 0;
    let totalViews = 0;

    for (const repo of entity.sources.github) {
      try {
        const res = await fetchWithRetry(
          `https://api.github.com/repos/${repo}`,
          { headers, signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) continue;

        const data = await res.json() as GitHubRepo;
        totalStars += data.stargazers_count ?? 0;
        totalForks += data.forks_count ?? 0;

        // Traffic endpoints (require push access, gracefully skip on 403)
        if (token) {
          try {
            const [clonesRes, viewsRes] = await Promise.all([
              fetchWithRetry(
                `https://api.github.com/repos/${repo}/traffic/clones`,
                { headers, signal: AbortSignal.timeout(10000) }
              ),
              fetchWithRetry(
                `https://api.github.com/repos/${repo}/traffic/views`,
                { headers, signal: AbortSignal.timeout(10000) }
              ),
            ]);

            if (clonesRes.ok) {
              const clonesData = await clonesRes.json() as TrafficData;
              totalClones += clonesData.count ?? 0;
            } else if (clonesRes.status === 403) {
              console.warn(`[github] Traffic clones 403 for ${repo} — push access required, skipping`);
            }

            if (viewsRes.ok) {
              const viewsData = await viewsRes.json() as TrafficData;
              totalViews += viewsData.count ?? 0;
            } else if (viewsRes.status === 403) {
              console.warn(`[github] Traffic views 403 for ${repo} — push access required, skipping`);
            }
          } catch {
            // Skip traffic on error — non-critical
          }
        }
      } catch {
        // Skip failed repos
      }
      await delay(200);
    }

    if (totalStars > 0) {
      absolute.set(entity.id, totalStars);

      // Compute stars velocity: today's stars minus 7 days ago
      // If no historical data, skip — don't use absolute count as velocity
      const stars7dAgo = await getRawSignalValue(entity.id, 'github_stars', 7);
      if (stars7dAgo !== null) {
        velocity.set(entity.id, Math.max(0, totalStars - stars7dAgo));
      }
    }

    if (totalForks > 0) {
      forks.set(entity.id, totalForks);

      // Compute forks velocity: today's forks minus 7 days ago
      // If no historical data, skip — don't use absolute count as velocity
      const forks7dAgo = await getRawSignalValue(entity.id, 'github_forks', 7);
      if (forks7dAgo !== null) {
        forksVelocity.set(entity.id, Math.max(0, totalForks - forks7dAgo));
      }
    }

    if (totalClones > 0) {
      clones.set(entity.id, totalClones);
    }
    if (totalViews > 0) {
      views.set(entity.id, totalViews);
    }
  }

  return { velocity, absolute, forks, forksVelocity, clones, views };
}
