import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../entity-registry', () => ({
  getEntityRegistry: vi.fn(),
}));

vi.mock('../fetch-utils', () => ({
  fetchWithRetry: vi.fn(),
  delay: vi.fn().mockResolvedValue(undefined),
}));

import { collectDockerHub } from '../docker-hub';
import { getEntityRegistry } from '../../entity-registry';
import { fetchWithRetry } from '../fetch-utils';

const mockGetEntityRegistry = vi.mocked(getEntityRegistry);
const mockFetchWithRetry = vi.mocked(fetchWithRetry);

function makeEntity(id: string, dockerHub: string[] | null) {
  return {
    id,
    name: id,
    category: 'general_llm',
    company: 'Test',
    release_date: '2024-01-01',
    pricing_tier: 'free',
    availability: 'API',
    open_source: 1,
    description: '',
    sources: {
      pypi: null, npm: null, github: null, huggingface: null,
      hackernews: [], reddit: [], openRouter: null,
      semanticScholar: [], groq: null, artificialAnalysis: null,
      lmsysArena: null, hfLeaderboard: null, smolai: [],
      openWebUI: [], cloudflareRadar: null, ollama: null,
      stackoverflow: null, arxiv: [], manifoldMarkets: [],
      wikipedia: null,
      dockerHub,
    },
  };
}

function mockJsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

describe('collectDockerHub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty map when no entities have dockerHub sources', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('no-docker', null),
    ]);

    const result = await collectDockerHub();
    expect(result.size).toBe(0);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('fetches pull counts for entities with dockerHub sources', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('vllm', ['vllm/vllm-openai']),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ pull_count: 1_500_000, star_count: 42 }),
    );

    const result = await collectDockerHub();
    expect(result.get('vllm')).toBe(1_500_000);
    expect(mockFetchWithRetry).toHaveBeenCalledOnce();
    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      'https://hub.docker.com/v2/repositories/vllm/vllm-openai',
      expect.any(Object),
    );
  });

  it('sums pull counts across multiple repos for one entity', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('multi', ['org/repo-a', 'org/repo-b']),
    ]);
    mockFetchWithRetry
      .mockResolvedValueOnce(mockJsonResponse({ pull_count: 100_000 }))
      .mockResolvedValueOnce(mockJsonResponse({ pull_count: 200_000 }));

    const result = await collectDockerHub();
    expect(result.get('multi')).toBe(300_000);
  });

  it('deduplicates shared repos across entities', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('entity-a', ['shared/repo']),
      makeEntity('entity-b', ['shared/repo']),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ pull_count: 500_000 }),
    );

    const result = await collectDockerHub();
    expect(result.get('entity-a')).toBe(500_000);
    expect(result.get('entity-b')).toBe(500_000);
    expect(mockFetchWithRetry).toHaveBeenCalledOnce();
  });

  it('skips repos that return non-ok response', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('bad', ['missing/repo']),
    ]);
    mockFetchWithRetry.mockResolvedValue(mockJsonResponse({}, false));

    const result = await collectDockerHub();
    expect(result.size).toBe(0);
  });

  it('skips repos that throw errors', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('error', ['broken/repo']),
    ]);
    mockFetchWithRetry.mockRejectedValue(new Error('network error'));

    const result = await collectDockerHub();
    expect(result.size).toBe(0);
  });
});
