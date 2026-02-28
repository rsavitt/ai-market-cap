import { getEntityRegistry } from '../entity-registry';

interface HFModel {
  downloads: number;
  likes: number;
}

export async function collectHuggingFace(): Promise<Map<string, number>> {
  const entityRegistry = await getEntityRegistry();
  const results = new Map<string, number>();

  for (const entity of entityRegistry) {
    if (!entity.sources.huggingface) continue;

    let totalSignal = 0;

    for (const modelId of entity.sources.huggingface) {
      try {
        const res = await fetch(
          `https://huggingface.co/api/models/${modelId}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) continue;

        const data = await res.json() as HFModel;
        // Combine downloads and likes (likes weighted 100x since they're much rarer)
        totalSignal += (data.downloads ?? 0) + (data.likes ?? 0) * 100;
      } catch {
        // Skip failed models
      }
    }

    if (totalSignal > 0) {
      results.set(entity.id, totalSignal);
    }
  }

  return results;
}
