import { getEntityRegistry } from '../entity-registry';
import { getRawSignalValue } from '../db';
import { fetchWithRetry, delay } from './fetch-utils';

interface HFModel {
  downloads: number;
  likes: number;
}

export interface HuggingFaceResult {
  signal: Map<string, number>;
  downloads: Map<string, number>;
  likes: Map<string, number>;
  downloadsVelocity: Map<string, number>;
}

export async function collectHuggingFace(): Promise<HuggingFaceResult> {
  const entityRegistry = await getEntityRegistry();
  const signal = new Map<string, number>();
  const downloads = new Map<string, number>();
  const likes = new Map<string, number>();
  const downloadsVelocity = new Map<string, number>();

  for (const entity of entityRegistry) {
    if (!entity.sources.huggingface) continue;

    let totalSignal = 0;
    let totalDownloads = 0;
    let totalLikes = 0;

    for (const modelId of entity.sources.huggingface) {
      try {
        const res = await fetchWithRetry(
          `https://huggingface.co/api/models/${modelId}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) continue;

        const data = await res.json() as HFModel;
        const dl = data.downloads ?? 0;
        const lk = data.likes ?? 0;
        totalDownloads += dl;
        totalLikes += lk;
        // Combine downloads and likes (likes weighted 100x since they're much rarer)
        totalSignal += dl + lk * 100;
      } catch {
        // Skip failed models
      }
      await delay(200);
    }

    if (totalSignal > 0) {
      signal.set(entity.id, totalSignal);
    }
    if (totalDownloads > 0) {
      downloads.set(entity.id, totalDownloads);

      // Compute download velocity: today's downloads minus 7 days ago
      const dl7dAgo = await getRawSignalValue(entity.id, 'hf_downloads', 7);
      if (dl7dAgo !== null) {
        downloadsVelocity.set(entity.id, totalDownloads - dl7dAgo);
      } else {
        // Graceful degradation: use absolute count if no history
        downloadsVelocity.set(entity.id, totalDownloads);
      }
    }
    if (totalLikes > 0) {
      likes.set(entity.id, totalLikes);
    }
  }

  return { signal, downloads, likes, downloadsVelocity };
}
