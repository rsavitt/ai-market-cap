import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry, delay } from './fetch-utils';

export async function collectPyPI(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();
  const packageToEntities = new Map<string, string[]>();

  // Build reverse map: package name → entity IDs that use it
  for (const entity of entityRegistry) {
    if (!entity.sources.pypi) continue;
    for (const pkg of entity.sources.pypi) {
      const existing = packageToEntities.get(pkg) || [];
      existing.push(entity.id);
      packageToEntities.set(pkg, existing);
    }
  }

  // Fetch downloads for each unique package
  for (const [pkg, entityIds] of Array.from(packageToEntities.entries())) {
    try {
      const res = await fetchWithRetry(
        `https://pypistats.org/api/packages/${pkg}/recent?period=day`,
        { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;

      const data = await res.json() as { data: { last_day: number } };
      const downloads = data.data?.last_day ?? 0;

      for (const entityId of entityIds) {
        results.set(entityId, (results.get(entityId) || 0) + downloads);
      }
    } catch {
      // Skip failed packages silently
    }
    await delay(200);
  }

  return results;
}
