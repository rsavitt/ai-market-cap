import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../entity-registry', () => ({
  getEntityRegistry: vi.fn(),
}));

vi.mock('../fetch-utils', () => ({
  fetchWithRetry: vi.fn(),
  delay: vi.fn().mockResolvedValue(undefined),
}));

import { collectWikipediaPageviews } from '../wikipedia-pageviews';
import { getEntityRegistry } from '../../entity-registry';
import { fetchWithRetry } from '../fetch-utils';

const mockGetEntityRegistry = vi.mocked(getEntityRegistry);
const mockFetchWithRetry = vi.mocked(fetchWithRetry);

function makeEntity(id: string, wikipedia: string | null) {
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
      wikipedia,
      dockerHub: null,
    },
  };
}

function mockJsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

describe('collectWikipediaPageviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty map when no entities have wikipedia sources', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('no-wiki', null),
    ]);

    const result = await collectWikipediaPageviews();
    expect(result.size).toBe(0);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('fetches and sums pageviews for entities with wikipedia sources', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('gpt4', 'GPT-4'),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({
        items: [
          { views: 1000 },
          { views: 2000 },
          { views: 1500 },
        ],
      }),
    );

    const result = await collectWikipediaPageviews();
    expect(result.get('gpt4')).toBe(4500);
    expect(mockFetchWithRetry).toHaveBeenCalledOnce();
    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      expect.stringContaining('GPT-4'),
      expect.any(Object),
    );
  });

  it('deduplicates shared titles across entities', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('entity-a', 'Shared_Article'),
      makeEntity('entity-b', 'Shared_Article'),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ items: [{ views: 5000 }] }),
    );

    const result = await collectWikipediaPageviews();
    expect(result.get('entity-a')).toBe(5000);
    expect(result.get('entity-b')).toBe(5000);
    expect(mockFetchWithRetry).toHaveBeenCalledOnce();
  });

  it('skips titles that return non-ok response', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('bad', 'Missing_Article'),
    ]);
    mockFetchWithRetry.mockResolvedValue(mockJsonResponse({}, false));

    const result = await collectWikipediaPageviews();
    expect(result.size).toBe(0);
  });

  it('skips titles that throw errors', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('error', 'Error_Article'),
    ]);
    mockFetchWithRetry.mockRejectedValue(new Error('network error'));

    const result = await collectWikipediaPageviews();
    expect(result.size).toBe(0);
  });

  it('handles empty items array', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('empty', 'Empty_Article'),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ items: [] }),
    );

    const result = await collectWikipediaPageviews();
    expect(result.get('empty')).toBe(0);
  });
});
