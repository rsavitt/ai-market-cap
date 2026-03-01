import { getEntityRegistry } from '../entity-registry';
import { fetchWithRetry } from './fetch-utils';

export interface ArtificialAnalysisResult {
  llmIntelligence: Map<string, number>;
  imageArena: Map<string, number>;
  videoArena: Map<string, number>;
}

interface AALlmModel {
  id: string;
  name: string;
  slug: string;
  evaluations?: {
    artificial_analysis_intelligence_index?: number | null;
  };
}

interface AAMediaModel {
  id: string;
  name: string;
  elo?: number | null;
}

const BASE_URL = 'https://artificialanalysis.ai/api/v2';

export async function collectArtificialAnalysis(): Promise<ArtificialAnalysisResult> {
  const entityRegistry = await getEntityRegistry();

  const llmIntelligence = new Map<string, number>();
  const imageArena = new Map<string, number>();
  const videoArena = new Map<string, number>();

  // Build reverse map: AA slug → entity ID
  const aaSlugToEntity = new Map<string, string>();
  for (const entity of entityRegistry) {
    if (entity.sources.artificialAnalysis) {
      aaSlugToEntity.set(entity.sources.artificialAnalysis, entity.id);
    }
  }

  if (aaSlugToEntity.size === 0) {
    return { llmIntelligence, imageArena, videoArena };
  }

  const apiKey = process.env.ARTIFICIAL_ANALYSIS_API_KEY;
  if (!apiKey) {
    return { llmIntelligence, imageArena, videoArena };
  }

  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'Accept': 'application/json',
  };
  const fetchOpts: RequestInit = {
    headers,
    signal: AbortSignal.timeout(20000),
  };

  // Fetch all 3 endpoints in parallel
  const [llmRes, imageRes, videoRes] = await Promise.all([
    fetchWithRetry(`${BASE_URL}/data/llms/models`, fetchOpts).catch(() => null),
    fetchWithRetry(`${BASE_URL}/data/media/text-to-image`, fetchOpts).catch(() => null),
    fetchWithRetry(`${BASE_URL}/data/media/text-to-video`, fetchOpts).catch(() => null),
  ]);

  // Process LLM intelligence index
  if (llmRes?.ok) {
    try {
      const body = await llmRes.json() as AALlmModel[] | { data: AALlmModel[] };
      const models = Array.isArray(body) ? body : (body.data ?? []);
      for (const model of models) {
        const entityId = aaSlugToEntity.get(model.slug);
        if (!entityId) continue;
        const score = model.evaluations?.artificial_analysis_intelligence_index;
        if (score != null && score > 0) {
          llmIntelligence.set(entityId, score);
        }
      }
    } catch {
      // Malformed response — skip
    }
  }

  // Process image arena ELO
  if (imageRes?.ok) {
    try {
      const body = await imageRes.json() as AAMediaModel[] | { data: AAMediaModel[] };
      const models = Array.isArray(body) ? body : (body.data ?? []);
      for (const model of models) {
        const entityId = aaSlugToEntity.get(model.name) ?? aaSlugToEntity.get(String(model.id));
        if (!entityId) continue;
        if (model.elo != null && model.elo > 0) {
          imageArena.set(entityId, model.elo);
        }
      }
    } catch {
      // Malformed response — skip
    }
  }

  // Process video arena ELO
  if (videoRes?.ok) {
    try {
      const body = await videoRes.json() as AAMediaModel[] | { data: AAMediaModel[] };
      const models = Array.isArray(body) ? body : (body.data ?? []);
      for (const model of models) {
        const entityId = aaSlugToEntity.get(model.name) ?? aaSlugToEntity.get(String(model.id));
        if (!entityId) continue;
        if (model.elo != null && model.elo > 0) {
          videoArena.set(entityId, model.elo);
        }
      }
    } catch {
      // Malformed response — skip
    }
  }

  return { llmIntelligence, imageArena, videoArena };
}
