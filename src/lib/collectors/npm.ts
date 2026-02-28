import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry, delay } from './fetch-utils';

export async function collectNpm(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();
  const packageToEntities = new Map<string, string[]>();

  for (const entity of entityRegistry) {
    if (!entity.sources.npm) continue;
    for (const pkg of entity.sources.npm) {
      const existing = packageToEntities.get(pkg) || [];
      existing.push(entity.id);
      packageToEntities.set(pkg, existing);
    }
  }

  // npm API: GET /downloads/point/last-day/{package}
  for (const [pkg, entityIds] of Array.from(packageToEntities.entries())) {
    try {
      const res = await fetchWithRetry(
        `https://api.npmjs.org/downloads/point/last-day/${encodeURIComponent(pkg)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;

      const data = await res.json() as { downloads: number };
      const downloads = data.downloads ?? 0;

      for (const entityId of entityIds) {
        results.set(entityId, (results.get(entityId) || 0) + downloads);
      }
    } catch {
      // Skip failed packages
    }
    await delay(200);
  }

  return results;
}
