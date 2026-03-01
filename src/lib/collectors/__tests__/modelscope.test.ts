import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseModelScopeResponse, collectModelScope } from '../modelscope';

// ── parseModelScopeResponse unit tests ──

describe('parseModelScopeResponse', () => {
  it('parses valid response with downloads', () => {
    expect(parseModelScopeResponse({
      Code: 200,
      Success: true,
      Data: { Downloads: 915074 },
    })).toBe(915074);
  });

  it('returns 0 for non-200 code', () => {
    expect(parseModelScopeResponse({
      Code: 404,
      Success: false,
      Data: null,
    })).toBe(0);
  });

  it('returns 0 for missing Data', () => {
    expect(parseModelScopeResponse({
      Code: 200,
      Success: true,
    })).toBe(0);
  });

  it('returns 0 for missing Downloads field', () => {
    expect(parseModelScopeResponse({
      Code: 200,
      Success: true,
      Data: { Stars: 100 },
    })).toBe(0);
  });

  it('returns 0 for null input', () => {
    expect(parseModelScopeResponse(null)).toBe(0);
  });

  it('returns 0 for non-object input', () => {
    expect(parseModelScopeResponse('string')).toBe(0);
  });

  it('returns 0 for NaN downloads', () => {
    expect(parseModelScopeResponse({
      Code: 200,
      Success: true,
      Data: { Downloads: NaN },
    })).toBe(0);
  });

  it('returns 0 for negative downloads', () => {
    expect(parseModelScopeResponse({
      Code: 200,
      Success: true,
      Data: { Downloads: -100 },
    })).toBe(0);
  });

  it('rounds fractional downloads', () => {
    expect(parseModelScopeResponse({
      Code: 200,
      Success: true,
      Data: { Downloads: 1234.7 },
    })).toBe(1235);
  });
});

// ── collectModelScope integration tests ──

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

function makeEntity(id: string, modelscope: string[] | null) {
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
      ollama: null, stackoverflow: null,
      arxiv: [], manifoldMarkets: [],
      wikipedia: null, dockerHub: null,
      modelscope,
    },
  };
}

function mockJsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

describe('collectModelScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty map when no entities have modelscope sources', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('no-modelscope', null),
    ]);

    const result = await collectModelScope();
    expect(result.size).toBe(0);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('fetches download counts for entities with modelscope sources', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('deepseek-r1', ['deepseek-ai/DeepSeek-R1']),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ Code: 200, Success: true, Data: { Downloads: 915074 } }),
    );

    const result = await collectModelScope();
    expect(result.get('deepseek-r1')).toBe(915074);
    expect(mockFetchWithRetry).toHaveBeenCalledOnce();
    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      'https://modelscope.cn/api/v1/models/deepseek-ai/DeepSeek-R1',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('sums downloads across multiple model IDs for one entity', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('multi', ['owner/model-a', 'owner/model-b']),
    ]);
    mockFetchWithRetry
      .mockResolvedValueOnce(mockJsonResponse({ Code: 200, Success: true, Data: { Downloads: 100000 } }))
      .mockResolvedValueOnce(mockJsonResponse({ Code: 200, Success: true, Data: { Downloads: 200000 } }));

    const result = await collectModelScope();
    expect(result.get('multi')).toBe(300000);
  });

  it('deduplicates shared model IDs across entities', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('entity-a', ['shared/model']),
      makeEntity('entity-b', ['shared/model']),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ Code: 200, Success: true, Data: { Downloads: 500000 } }),
    );

    const result = await collectModelScope();
    expect(result.get('entity-a')).toBe(500000);
    expect(result.get('entity-b')).toBe(500000);
    expect(mockFetchWithRetry).toHaveBeenCalledOnce();
  });

  it('skips models that return non-ok response', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('bad', ['missing/model']),
    ]);
    mockFetchWithRetry.mockResolvedValue(mockJsonResponse({}, false));

    const result = await collectModelScope();
    expect(result.size).toBe(0);
  });

  it('skips models that throw errors', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('error', ['broken/model']),
    ]);
    mockFetchWithRetry.mockRejectedValue(new Error('network error'));

    const result = await collectModelScope();
    expect(result.size).toBe(0);
  });

  it('skips models with zero downloads', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('zero', ['empty/model']),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockJsonResponse({ Code: 200, Success: true, Data: { Downloads: 0 } }),
    );

    const result = await collectModelScope();
    expect(result.size).toBe(0);
  });
});
