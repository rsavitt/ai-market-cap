import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePullCount, collectOllama } from '../ollama';

// ── parsePullCount unit tests ──

describe('parsePullCount', () => {
  it('parses millions suffix', () => {
    expect(parsePullCount('<span>1.2M Pulls</span>')).toBe(1_200_000);
  });

  it('parses thousands suffix', () => {
    expect(parsePullCount('<span>523K Pulls</span>')).toBe(523_000);
  });

  it('parses billions suffix', () => {
    expect(parsePullCount('<span>2.5B Pulls</span>')).toBe(2_500_000_000);
  });

  it('parses plain number with commas', () => {
    expect(parsePullCount('<span>12,345 Pulls</span>')).toBe(12_345);
  });

  it('parses plain number without commas', () => {
    expect(parsePullCount('<span>999 Pulls</span>')).toBe(999);
  });

  it('handles lowercase suffix', () => {
    expect(parsePullCount('<span>3.7m pulls</span>')).toBe(3_700_000);
  });

  it('handles lowercase k', () => {
    expect(parsePullCount('<span>50k Pulls</span>')).toBe(50_000);
  });

  it('returns 0 for no match', () => {
    expect(parsePullCount('<span>No data here</span>')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(parsePullCount('')).toBe(0);
  });

  it('handles decimal K values', () => {
    expect(parsePullCount('<span>1.5K Pulls</span>')).toBe(1_500);
  });

  it('handles whitespace between number and suffix', () => {
    expect(parsePullCount('<span>2.3 M Pulls</span>')).toBe(2_300_000);
  });

  it('handles pull count embedded in larger HTML', () => {
    const html = `
      <div class="model-info">
        <h1>llama3.3</h1>
        <span class="pulls">45.6M Pulls</span>
        <span>Updated 3 days ago</span>
      </div>
    `;
    expect(parsePullCount(html)).toBe(45_600_000);
  });

  it('parses x-test-pull-count attribute format', () => {
    expect(parsePullCount('<span x-test-pull-count>3.3M</span>')).toBe(3_300_000);
  });

  it('parses x-test-pull-count with K suffix', () => {
    expect(parsePullCount('<span x-test-pull-count>850K</span>')).toBe(850_000);
  });

  it('parses x-test-pull-count embedded in full page HTML', () => {
    const html = `
      <div>
        <h1>llama3.3</h1>
        <span x-test-pull-count>3.3M</span>
        <span>Updated 2 days ago</span>
      </div>
    `;
    expect(parsePullCount(html)).toBe(3_300_000);
  });

  it('prefers x-test-pull-count over Pulls text when both present', () => {
    const html = '<span x-test-pull-count>5M</span><span>3M Pulls</span>';
    expect(parsePullCount(html)).toBe(5_000_000);
  });
});

// ── collectOllama integration tests ──

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

function makeEntity(id: string, ollama: string[] | null) {
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
      ollama,
      stackoverflow: null,
      arxiv: [],
      manifoldMarkets: [],
    },
  };
}

function mockResponse(body: string, ok = true): Response {
  return {
    ok,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as unknown as Response;
}

describe('collectOllama', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty map when no entities have ollama sources', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('no-ollama', null),
    ]);

    const result = await collectOllama();
    expect(result.size).toBe(0);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('fetches pull counts for entities with ollama sources', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('llama', ['llama3.3']),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockResponse('<span>45.6M Pulls</span>'),
    );

    const result = await collectOllama();
    expect(result.get('llama')).toBe(45_600_000);
    expect(mockFetchWithRetry).toHaveBeenCalledOnce();
    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      'https://ollama.com/library/llama3.3',
      expect.objectContaining({ headers: { Accept: 'text/html' } }),
    );
  });

  it('sums pull counts across multiple slugs for one entity', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('multi', ['model-a', 'model-b']),
    ]);
    mockFetchWithRetry
      .mockResolvedValueOnce(mockResponse('<span>100K Pulls</span>'))
      .mockResolvedValueOnce(mockResponse('<span>200K Pulls</span>'));

    const result = await collectOllama();
    expect(result.get('multi')).toBe(300_000);
  });

  it('deduplicates shared slugs across entities', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('entity-a', ['shared-model']),
      makeEntity('entity-b', ['shared-model']),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockResponse('<span>500K Pulls</span>'),
    );

    const result = await collectOllama();
    // Both entities get the same pull count from the shared slug
    expect(result.get('entity-a')).toBe(500_000);
    expect(result.get('entity-b')).toBe(500_000);
    // Only one fetch for the deduplicated slug
    expect(mockFetchWithRetry).toHaveBeenCalledOnce();
  });

  it('skips slugs that return non-ok response', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('bad', ['missing-model']),
    ]);
    mockFetchWithRetry.mockResolvedValue(mockResponse('', false));

    const result = await collectOllama();
    expect(result.size).toBe(0);
  });

  it('skips slugs that throw errors', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('error', ['broken-model']),
    ]);
    mockFetchWithRetry.mockRejectedValue(new Error('network error'));

    const result = await collectOllama();
    expect(result.size).toBe(0);
  });

  it('skips slugs with unparseable pull counts', async () => {
    mockGetEntityRegistry.mockResolvedValue([
      makeEntity('no-pulls', ['weird-model']),
    ]);
    mockFetchWithRetry.mockResolvedValue(
      mockResponse('<span>No pull data available</span>'),
    );

    const result = await collectOllama();
    expect(result.size).toBe(0);
  });
});
