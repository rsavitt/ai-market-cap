import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectStackOverflow } from '../stackoverflow';

vi.mock('../../entity-registry', () => ({
  getEntityRegistry: vi.fn(),
}));

vi.mock('../fetch-utils', () => ({
  fetchWithRetry: vi.fn(),
  delay: vi.fn().mockResolvedValue(undefined),
}));

import { getEntityRegistry } from '../../entity-registry';
import { fetchWithRetry } from '../fetch-utils';

const mockGetEntityRegistry = vi.mocked(getEntityRegistry);
const mockFetchWithRetry = vi.mocked(fetchWithRetry);

function makeEntity(id: string, stackoverflow: string[] | null) {
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
      openWebUI: [], cloudflareRadar: null,
      ollama: null,
      stackoverflow,
      arxiv: [],
      manifoldMarkets: [],
    },
  };
}

function mockResponse(body: object, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('collectStackOverflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STACK_OVERFLOW_API_KEY;
  });

  it('returns empty map when no entities have stackoverflow sources', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('no-so', null),
    ]);

    const result = await collectStackOverflow();
    expect(result.size).toBe(0);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('returns empty map for empty stackoverflow array', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('empty-so', []),
    ]);

    const result = await collectStackOverflow();
    expect(result.size).toBe(0);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('fetches question counts for a single query', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('gpt', ['openai-api']),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockResponse({ total: 4500 }),
    );

    const result = await collectStackOverflow();
    expect(result.get('gpt')).toBe(4500);
    expect(mockFetchWithRetry).toHaveBeenCalledOnce();

    const url = mockFetchWithRetry.mock.calls[0][0] as string;
    expect(url).toContain('api.stackexchange.com/2.3/search');
    expect(url).toContain('intitle=openai-api');
    expect(url).toContain('site=stackoverflow');
    expect(url).toContain('filter=total');
  });

  it('sums question counts across multiple queries for one entity', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('claude', ['claude', 'anthropic']),
    ]);
    mockFetchWithRetry
      .mockResolvedValueOnce(mockResponse({ total: 300 }))
      .mockResolvedValueOnce(mockResponse({ total: 200 }));

    const result = await collectStackOverflow();
    expect(result.get('claude')).toBe(500);
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('collects for multiple entities independently', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('entity-a', ['query-a']),
      makeEntity('entity-b', ['query-b']),
    ]);
    mockFetchWithRetry
      .mockResolvedValueOnce(mockResponse({ total: 100 }))
      .mockResolvedValueOnce(mockResponse({ total: 200 }));

    const result = await collectStackOverflow();
    expect(result.get('entity-a')).toBe(100);
    expect(result.get('entity-b')).toBe(200);
  });

  it('skips queries that return non-ok response', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('bad', ['failing-query']),
    ]);
    mockFetchWithRetry.mockResolvedValue(mockResponse({}, false));

    const result = await collectStackOverflow();
    expect(result.size).toBe(0);
  });

  it('skips queries that throw errors', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('error', ['broken-query']),
    ]);
    mockFetchWithRetry.mockRejectedValue(new Error('network error'));

    const result = await collectStackOverflow();
    expect(result.size).toBe(0);
  });

  it('excludes entities with zero total questions', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('zero', ['obscure-query']),
    ]);
    mockFetchWithRetry.mockResolvedValue(mockResponse({ total: 0 }));

    const result = await collectStackOverflow();
    expect(result.size).toBe(0);
  });

  it('handles null total in response gracefully', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('null-total', ['some-query']),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockResponse({ total: null } as any),
    );

    const result = await collectStackOverflow();
    expect(result.size).toBe(0);
  });

  it('includes API key in request when env var is set', async () => {
    process.env.STACK_OVERFLOW_API_KEY = 'test-key-123';
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('with-key', ['test-query']),
    ]);
    mockFetchWithRetry.mockResolvedValue(mockResponse({ total: 10 }));

    await collectStackOverflow();

    const url = mockFetchWithRetry.mock.calls[0][0] as string;
    expect(url).toContain('key=test-key-123');
  });

  it('omits API key from request when env var is not set', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('no-key', ['test-query']),
    ]);
    mockFetchWithRetry.mockResolvedValue(mockResponse({ total: 10 }));

    await collectStackOverflow();

    const url = mockFetchWithRetry.mock.calls[0][0] as string;
    expect(url).not.toContain('key=');
  });

  it('continues collecting after a failed query in a multi-query entity', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('partial', ['good-query', 'bad-query', 'other-good']),
    ]);
    mockFetchWithRetry
      .mockResolvedValueOnce(mockResponse({ total: 100 }))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(mockResponse({ total: 50 }));

    const result = await collectStackOverflow();
    expect(result.get('partial')).toBe(150);
  });
});
