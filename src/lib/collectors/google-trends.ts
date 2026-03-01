import * as googleTrends from 'google-trends-api';
import { getEntityRegistry } from '../entity-registry';
import { delay } from './fetch-utils';

export async function collectGoogleTrends(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  for (const entity of entityRegistry) {
    let totalVelocity = 0;

    for (const query of entity.sources.hackernews) {
      try {
        const raw = await googleTrends.interestOverTime({
          keyword: query,
          startTime: sevenDaysAgo,
          geo: '',
        });
        const parsed = JSON.parse(raw);
        const timeline = parsed?.default?.timelineData;
        if (Array.isArray(timeline) && timeline.length >= 2) {
          const earliest = timeline[0]?.value?.[0] ?? 0;
          const latest = timeline[timeline.length - 1]?.value?.[0] ?? 0;
          totalVelocity += Math.max(0, latest - earliest);
        }
      } catch {
        // Skip failed queries
      }
      await delay(200);
    }

    if (totalVelocity > 0) {
      results.set(entity.id, totalVelocity);
    }
  }

  return results;
}
