import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry, delay } from './fetch-utils';

/**
 * Collect Docker Hub pull counts for AI-related container images.
 * API: Docker Hub v2 (no auth required).
 * Returns Map<entityId, pullCount>.
 */
export async function collectDockerHub(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();
  const repoToEntities = new Map<string, string[]>();

  // Build reverse map: repo (namespace/name) → entity IDs
  for (const entity of entityRegistry) {
    if (!entity.sources.dockerHub) continue;
    for (const repo of entity.sources.dockerHub) {
      const existing = repoToEntities.get(repo) || [];
      existing.push(entity.id);
      repoToEntities.set(repo, existing);
    }
  }

  for (const [repo, entityIds] of Array.from(repoToEntities.entries())) {
    try {
      const res = await fetchWithRetry(
        `https://hub.docker.com/v2/repositories/${repo}`,
        { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;

      const data = await res.json() as { pull_count?: number };
      const pulls = data.pull_count ?? 0;

      for (const entityId of entityIds) {
        results.set(entityId, (results.get(entityId) || 0) + pulls);
      }
    } catch {
      // Skip failed repos silently
    }
    await delay(200);
  }

  return results;
}
