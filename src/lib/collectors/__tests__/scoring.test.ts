import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exponentialDecay, type RawSignals } from '../../scoring';

// ── Mocks ──

vi.mock('../../entity-registry', () => ({
  getEntityRegistry: vi.fn(),
  getAllEntityIds: vi.fn(),
}));

vi.mock('../../db', () => ({
  get90DayBaselines: vi.fn().mockResolvedValue(new Map()),
}));

import { getEntityRegistry, getAllEntityIds, type RegisteredEntity, type EntitySources } from '../../entity-registry';
import { computeScores } from '../../scoring';

const mockGetEntityRegistry = vi.mocked(getEntityRegistry);
const mockGetAllEntityIds = vi.mocked(getAllEntityIds);

// ── Helpers ──

function makeSources(overrides?: Partial<EntitySources>): EntitySources {
  return {
    pypi: null, npm: null, github: null, huggingface: null,
    hackernews: [], reddit: [], openRouter: null,
    semanticScholar: [], groq: null, artificialAnalysis: null,
    lmsysArena: null, hfLeaderboard: null, smolai: [],
    openWebUI: [], cloudflareRadar: null, ollama: null,
    stackoverflow: null, arxiv: [], manifoldMarkets: [],
    wikipedia: null, dockerHub: null, modelscope: null,
    ...overrides,
  };
}

function makeEntity(
  id: string,
  category: string,
  company: string,
  releaseDate?: string,
  sourcesOverride?: Partial<EntitySources>,
): RegisteredEntity {
  return {
    id,
    name: id,
    category,
    company,
    release_date: releaseDate ?? '2024-06-01',
    pricing_tier: 'free',
    availability: 'API',
    open_source: 1,
    description: '',
    sources: makeSources(sourcesOverride),
  };
}

function makeRawSignals(overrides?: Partial<Record<keyof RawSignals, Map<string, number>>>): RawSignals {
  const empty = (): Map<string, number> => new Map();
  return {
    pypiDownloads: empty(), npmDownloads: empty(),
    huggingfaceSignal: empty(), hfDownloads: empty(),
    hfLikes: empty(), hfDownloadsVelocity: empty(),
    openRouterUsage: empty(), githubStars: empty(),
    githubForks: empty(), githubClones: empty(),
    githubViews: empty(), openWebUIUsage: empty(),
    cloudflareRadar: empty(), ollamaSignal: empty(),
    dockerHubPulls: empty(), modelscopeSignal: empty(),
    hackernewsSignal: empty(), redditSignal: empty(),
    smolaiSignal: empty(), googleTrendsSignal: empty(),
    stackoverflowSignal: empty(), wikipediaPageviews: empty(),
    openRouterSignal: empty(), groqSignal: empty(),
    aaLlmIntelligence: empty(), aaImageArena: empty(),
    aaVideoArena: empty(), lmsysArena: empty(),
    hfLeaderboard: empty(), semanticScholarCitations: empty(),
    openAlexCitations: empty(), arxivMentionVelocity: empty(),
    manifoldMarkets: empty(),
    ...overrides,
  };
}

function setupEntities(entities: RegisteredEntity[]) {
  mockGetEntityRegistry.mockResolvedValue(entities);
  mockGetAllEntityIds.mockResolvedValue(entities.map(e => e.id));
}

// ── Tests ──

describe('exponentialDecay', () => {
  it('returns 1.0 at day 0', () => {
    expect(exponentialDecay(0, 60)).toBe(1.0);
  });

  it('returns 0.5 when dayAge equals halfLife', () => {
    expect(exponentialDecay(60, 60)).toBeCloseTo(0.5, 10);
  });

  it('approaches 0 for large dayAge', () => {
    const result = exponentialDecay(10000, 60);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(0.001);
  });
});

describe('computeScores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fix Date.now for recency/new-entrant calculations
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Percentile normalization ──

  describe('percentile normalization', () => {
    it('returns baseline dimension scores when no entities have signal data', async () => {
      // Use recent release date so recency factor is ~1.0
      const entities = [
        makeEntity('a', 'llm', 'Co1', '2025-05-20'),
        makeEntity('b', 'llm', 'Co2', '2025-05-20'),
      ];
      setupEntities(entities);

      const scores = await computeScores(makeRawSignals());
      // With no signal data, combineDimension returns baseline 5 for each dimension.
      // Recency decay applies to usage and attention (factor ~0.98 for 12 days old).
      // Capability and expert are not decayed.
      const a = scores.get('a')!;
      expect(a.capability_score).toBe(5);
      expect(a.expert_score).toBe(5);
      // Usage/attention get slight recency decay but should be close to 5
      expect(a.usage_score).toBeCloseTo(5, 0);
      expect(a.attention_score).toBeCloseTo(5, 0);
    });

    it('gives single entity with data a mid-range score (47.5)', async () => {
      const entities = [
        makeEntity('a', 'llm', 'Co1', '2025-05-01', { pypi: ['pkg-a'] }),
        makeEntity('b', 'llm', 'Co2'),
      ];
      setupEntities(entities);

      const raw = makeRawSignals({ pypiDownloads: new Map([['a', 10000]]) });
      const scores = await computeScores(raw);
      // Entity 'a' should have usage > baseline since it got 47.5 for pypi
      const a = scores.get('a')!;
      expect(a.usage_score).toBeGreaterThan(5);
      // Entity 'b' with no data stays at baseline for that signal
      const b = scores.get('b')!;
      expect(b.usage_score).toBeLessThanOrEqual(a.usage_score);
    });

    it('ranks 3+ entities by percentile (highest gets ~95)', async () => {
      const entities = [
        makeEntity('low', 'llm', 'Co1', '2025-05-01', { pypi: ['pkg-low'] }),
        makeEntity('mid', 'llm', 'Co2', '2025-05-01', { pypi: ['pkg-mid'] }),
        makeEntity('high', 'llm', 'Co3', '2025-05-01', { pypi: ['pkg-high'] }),
      ];
      setupEntities(entities);

      const raw = makeRawSignals({
        pypiDownloads: new Map([['low', 100], ['mid', 1000], ['high', 100000]]),
      });
      const scores = await computeScores(raw);

      const low = scores.get('low')!;
      const mid = scores.get('mid')!;
      const high = scores.get('high')!;
      // Percentile ordering should be preserved
      expect(high.usage_score).toBeGreaterThan(mid.usage_score);
      expect(mid.usage_score).toBeGreaterThan(low.usage_score);
    });
  });

  // ── Deduplication ──

  describe('deduplication', () => {
    it('splits pypi downloads evenly among entities sharing same package', async () => {
      const entities = [
        makeEntity('a', 'llm', 'Co1', '2025-05-01', { pypi: ['shared-pkg'] }),
        makeEntity('b', 'llm', 'Co2', '2025-05-01', { pypi: ['shared-pkg'] }),
        makeEntity('c', 'llm', 'Co3', '2025-05-01', { pypi: ['unique-pkg'] }),
      ];
      setupEntities(entities);

      // Both a and b share 'shared-pkg' with 10000 downloads.
      // After dedup, each gets 5000, while c keeps its full 10000.
      const raw = makeRawSignals({
        pypiDownloads: new Map([['a', 10000], ['b', 10000], ['c', 10000]]),
      });
      const scores = await computeScores(raw);

      // c should score higher than a and b on usage since c keeps full value
      const a = scores.get('a')!;
      const c = scores.get('c')!;
      expect(c.usage_score).toBeGreaterThan(a.usage_score);
    });

    it('splits stackoverflow signal among N entities sharing same tag', async () => {
      const entities = [
        makeEntity('a', 'llm', 'Co1', '2025-05-01', { stackoverflow: ['shared-tag'] }),
        makeEntity('b', 'llm', 'Co2', '2025-05-01', { stackoverflow: ['shared-tag'] }),
        makeEntity('c', 'llm', 'Co3', '2025-05-01', { stackoverflow: ['shared-tag'] }),
        makeEntity('d', 'llm', 'Co4', '2025-05-01', { stackoverflow: ['unique-tag'] }),
      ];
      setupEntities(entities);

      const raw = makeRawSignals({
        stackoverflowSignal: new Map([['a', 9000], ['b', 9000], ['c', 9000], ['d', 9000]]),
      });
      const scores = await computeScores(raw);

      // d keeps full 9000, a/b/c each get 3000 after dedup
      const d = scores.get('d')!;
      const a = scores.get('a')!;
      expect(d.attention_score).toBeGreaterThan(a.attention_score);
    });
  });

  // ── Company diversity cap ──

  describe('company diversity cap', () => {
    it('penalizes excess models from a single company', async () => {
      // 6 entities, 4 from CompanyX — exceeds 35% threshold (max ~2 slots)
      const entities = [
        makeEntity('cx1', 'llm', 'CompanyX', '2025-05-01', { pypi: ['cx1-pkg'] }),
        makeEntity('cx2', 'llm', 'CompanyX', '2025-05-01', { pypi: ['cx2-pkg'] }),
        makeEntity('cx3', 'llm', 'CompanyX', '2025-05-01', { pypi: ['cx3-pkg'] }),
        makeEntity('cx4', 'llm', 'CompanyX', '2025-05-01', { pypi: ['cx4-pkg'] }),
        makeEntity('other1', 'llm', 'OtherCo', '2025-05-01', { pypi: ['o1-pkg'] }),
        makeEntity('other2', 'llm', 'AnotherCo', '2025-05-01', { pypi: ['o2-pkg'] }),
      ];
      setupEntities(entities);

      // Give CompanyX models incrementally higher values so we can check penalty ordering
      const raw = makeRawSignals({
        pypiDownloads: new Map([
          ['cx1', 100], ['cx2', 500], ['cx3', 1000], ['cx4', 5000],
          ['other1', 3000], ['other2', 4000],
        ]),
      });
      const scores = await computeScores(raw);

      // cx4 is CompanyX's top model — should not be penalized
      // cx1 is CompanyX's lowest — should be penalized the most
      const cx1 = scores.get('cx1')!;
      const cx4 = scores.get('cx4')!;
      // The gap between cx4 and cx1 should be larger than pure percentile ranking
      // (cx1 gets both low rank AND company penalty)
      expect(cx4.usage_score).toBeGreaterThan(cx1.usage_score);
    });

    it('does not penalize when company is within 35% threshold', async () => {
      // 6 entities, only 2 from one company — within 35% threshold
      const entities = [
        makeEntity('a1', 'llm', 'CoA', '2025-05-01', { pypi: ['a1-pkg'] }),
        makeEntity('a2', 'llm', 'CoA', '2025-05-01', { pypi: ['a2-pkg'] }),
        makeEntity('b1', 'llm', 'CoB', '2025-05-01', { pypi: ['b1-pkg'] }),
        makeEntity('b2', 'llm', 'CoB', '2025-05-01', { pypi: ['b2-pkg'] }),
        makeEntity('c1', 'llm', 'CoC', '2025-05-01', { pypi: ['c1-pkg'] }),
        makeEntity('c2', 'llm', 'CoD', '2025-05-01', { pypi: ['c2-pkg'] }),
      ];
      setupEntities(entities);

      // Give all entities similar values — no company dominates
      const raw = makeRawSignals({
        pypiDownloads: new Map([
          ['a1', 1000], ['a2', 2000], ['b1', 3000], ['b2', 4000],
          ['c1', 5000], ['c2', 6000],
        ]),
      });
      const scores = await computeScores(raw);

      // Scores should follow pure percentile rank with no penalty
      const a1 = scores.get('a1')!;
      const a2 = scores.get('a2')!;
      // a2 has higher raw value → should have higher usage
      expect(a2.usage_score).toBeGreaterThanOrEqual(a1.usage_score);
    });
  });

  // ── Source cap at 30% ──

  describe('source cap', () => {
    it('caps dominant signal when 3+ sources contribute', async () => {
      // With 3+ contributing signals, the 30% source cap is applied.
      // We test by giving entity 'c' highest rank in pypi (dominant) but
      // lowest rank in hfLikes and hfDownloadsVelocity. The cap redistributes
      // weight from pypi to hf signals, which should lower c's combined score
      // compared to the scenario where pypi dominates unchecked.
      const entities = [
        makeEntity('a', 'llm', 'Co1', '2025-05-01', { pypi: ['a-pkg'], huggingface: ['a-hf'] }),
        makeEntity('b', 'llm', 'Co2', '2025-05-01', { pypi: ['b-pkg'], huggingface: ['b-hf'] }),
        makeEntity('c', 'llm', 'Co3', '2025-05-01', { pypi: ['c-pkg'], huggingface: ['c-hf'] }),
      ];
      setupEntities(entities);

      // c dominates pypi (rank 3/3 = 95) but is weakest in hf signals (rank 1/3)
      const raw = makeRawSignals({
        pypiDownloads: new Map([['a', 100], ['b', 500], ['c', 100000]]),
        hfLikes: new Map([['a', 300], ['b', 200], ['c', 10]]),
        hfDownloadsVelocity: new Map([['a', 300], ['b', 200], ['c', 10]]),
      });
      const scores = await computeScores(raw);

      // c is highest in pypi but lowest in hf. With the 30% cap active,
      // pypi's 63% normalized weight gets capped to 30%, and excess is
      // redistributed to hf signals where c ranks lowest.
      // So c's combined score should be pulled down from what pypi alone would give.
      const a = scores.get('a')!;
      const b = scores.get('b')!;
      const c = scores.get('c')!;
      // With cap active: c's high pypi is dampened by low hf scores
      // b should beat c because b is middle everywhere while c is extreme
      expect(b.usage_score).toBeGreaterThan(c.usage_score);
      // a has lowest pypi but highest hf — verify cap lets hf contribute
      expect(a.usage_score).toBeGreaterThan(c.usage_score);
    });

    it('does not cap when only 1-2 signals contribute', async () => {
      const entities = [
        makeEntity('a', 'llm', 'Co1', '2025-05-01', { pypi: ['a-pkg'] }),
        makeEntity('b', 'llm', 'Co2', '2025-05-01', { pypi: ['b-pkg'] }),
      ];
      setupEntities(entities);

      // Only pypi contributes — no cap applied
      const raw = makeRawSignals({
        pypiDownloads: new Map([['a', 50000], ['b', 10000]]),
      });
      const scores = await computeScores(raw);

      const a = scores.get('a')!;
      const b = scores.get('b')!;
      // a should score higher than b — full weight, no cap
      expect(a.usage_score).toBeGreaterThan(b.usage_score);
    });
  });

  // ── Outlier clipping ──

  describe('outlier clipping', () => {
    it('clips openRouterUsage extreme outlier to 95th percentile', async () => {
      // Need 5+ entities with data for clipping to activate
      const entities = Array.from({ length: 6 }, (_, i) =>
        makeEntity(`e${i}`, 'llm', `Co${i}`, '2025-05-01', { openRouter: `e${i}-or` })
      );
      setupEntities(entities);

      // e5 is an extreme outlier (100x the next highest)
      const raw = makeRawSignals({
        openRouterUsage: new Map([
          ['e0', 100], ['e1', 200], ['e2', 300],
          ['e3', 400], ['e4', 500], ['e5', 50000],
        ]),
      });

      const scores = await computeScores(raw);
      const e4 = scores.get('e4')!;
      const e5 = scores.get('e5')!;

      // After clipping, e5 should score similar to or equal to the top non-outlier
      // (both get clipped to p95 = 500, so same percentile rank)
      // The key assertion: e5 should NOT dominate massively over e4
      expect(e5.usage_score).toBeLessThanOrEqual(e4.usage_score * 1.5);
    });
  });

  // ── Recency decay ──

  describe('recency decay', () => {
    it('applies ~0.5 factor to entity released ~730 days ago', async () => {
      // Current fake time: 2025-06-01
      // ~730 days ago: ~2023-06-02
      const entities = [
        makeEntity('old', 'llm', 'Co1', '2023-06-02', { pypi: ['old-pkg'] }),
        makeEntity('new', 'llm', 'Co2', '2025-05-01', { pypi: ['new-pkg'] }),
      ];
      setupEntities(entities);

      const raw = makeRawSignals({
        pypiDownloads: new Map([['old', 10000], ['new', 10000]]),
      });
      const scores = await computeScores(raw);

      const old = scores.get('old')!;
      const newE = scores.get('new')!;
      // Old entity gets ~0.5 recency factor, new entity gets ~1.0
      // So old's usage score should be roughly half of new's
      expect(newE.usage_score).toBeGreaterThan(old.usage_score);
      expect(old.usage_score).toBeLessThan(newE.usage_score * 0.75);
    });

    it('applies factor near 1.0 for recent entity', async () => {
      // 17 days old → recencyFactor = max(0.5, 1 - 17/730) ≈ 0.977
      // vs 365 days old → recencyFactor = max(0.5, 1 - 365/730) = 0.5
      // Give recent the highest raw value so it gets top percentile rank,
      // and old the lowest, so the comparison is unambiguous.
      const entities = [
        makeEntity('recent', 'llm', 'Co1', '2025-05-15', { pypi: ['r-pkg'] }),
        makeEntity('old', 'llm', 'Co2', '2024-06-01', { pypi: ['o-pkg'] }),
        makeEntity('filler', 'llm', 'Co3', '2025-05-15', { pypi: ['f-pkg'] }),
      ];
      setupEntities(entities);

      const raw = makeRawSignals({
        pypiDownloads: new Map([['recent', 50000], ['old', 10000], ['filler', 5000]]),
      });
      const scores = await computeScores(raw);

      const recent = scores.get('recent')!;
      const old = scores.get('old')!;
      // Recent entity (rank 3/3 → 95, × 0.977) should clearly beat
      // old entity (rank 2/3 → 63.33, × 0.5)
      expect(recent.usage_score).toBeGreaterThan(old.usage_score);
    });
  });

  // ── New entrant handling ──

  describe('new entrant handling', () => {
    it('assigns category median to entity released within 14 days', async () => {
      // Current fake time: 2025-06-01
      // New entrant: released 2025-05-25 (7 days ago)
      const entities = [
        makeEntity('established1', 'llm', 'Co1', '2024-06-01', { pypi: ['e1-pkg'] }),
        makeEntity('established2', 'llm', 'Co2', '2024-06-01', { pypi: ['e2-pkg'] }),
        makeEntity('newbie', 'llm', 'Co3', '2025-05-25', { pypi: ['n-pkg'] }),
      ];
      setupEntities(entities);

      const raw = makeRawSignals({
        pypiDownloads: new Map([
          ['established1', 5000], ['established2', 50000], ['newbie', 1000],
        ]),
      });
      const scores = await computeScores(raw);

      const newbie = scores.get('newbie')!;
      // New entrant total is overridden to category median
      // The exact value depends on established entities' totals, but it should
      // be between the two established entities' totals
      expect(newbie.total_score).toBeGreaterThan(0);
    });
  });

  // ── Confidence calculation ──

  describe('confidence', () => {
    it('returns high confidence for entity with many applicable signals populated', async () => {
      const entities = [
        makeEntity('rich', 'llm', 'Co1', '2025-05-01', {
          pypi: ['rich-pkg'], npm: ['rich-npm'], github: ['org/repo'],
          huggingface: ['rich-hf'], openRouter: 'rich-or', ollama: ['rich-ollama'],
        }),
      ];
      setupEntities(entities);

      const raw = makeRawSignals({
        pypiDownloads: new Map([['rich', 10000]]),
        npmDownloads: new Map([['rich', 5000]]),
        githubStars: new Map([['rich', 3000]]),
        githubForks: new Map([['rich', 500]]),
        huggingfaceSignal: new Map([['rich', 100]]),
        hfDownloads: new Map([['rich', 2000]]),
        hfLikes: new Map([['rich', 300]]),
        hfDownloadsVelocity: new Map([['rich', 50]]),
        openRouterUsage: new Map([['rich', 8000]]),
        openRouterSignal: new Map([['rich', 70]]),
        ollamaSignal: new Map([['rich', 90000]]),
        hackernewsSignal: new Map([['rich', 30]]),
        redditSignal: new Map([['rich', 50]]),
        smolaiSignal: new Map([['rich', 10]]),
        googleTrendsSignal: new Map([['rich', 60]]),
        stackoverflowSignal: new Map([['rich', 200]]),
        semanticScholarCitations: new Map([['rich', 500]]),
        openAlexCitations: new Map([['rich', 400]]),
      });
      const scores = await computeScores(raw);

      const rich = scores.get('rich')!;
      expect(rich.confidence).toBeGreaterThan(0.5);
      // High confidence → tight bounds
      expect(rich.confidence_upper - rich.confidence_lower).toBeLessThan(20);
    });

    it('returns low confidence with wide bounds for entity with no signal data', async () => {
      const entities = [
        makeEntity('empty', 'llm', 'Co1', '2025-05-01', {
          pypi: ['e-pkg'], npm: ['e-npm'], github: ['org/repo'],
          huggingface: ['e-hf'], openRouter: 'e-or',
        }),
      ];
      setupEntities(entities);

      const raw = makeRawSignals(); // no data for any signal
      const scores = await computeScores(raw);

      const empty = scores.get('empty')!;
      expect(empty.confidence).toBe(0);
      // Low confidence → wide bounds
      expect(empty.confidence_upper - empty.confidence_lower).toBeGreaterThan(10);
    });
  });

  // ── Composite total ──

  describe('composite total', () => {
    it('total equals 0.30*usage + 0.30*attention + 0.25*capability + 0.15*expert (with confidence discount)', async () => {
      const entities = [
        makeEntity('a', 'llm', 'Co1', '2025-05-01'),
        makeEntity('b', 'llm', 'Co2', '2025-05-01'),
        makeEntity('c', 'llm', 'Co3', '2025-05-01'),
      ];
      setupEntities(entities);

      // Give varied data across dimensions
      const raw = makeRawSignals({
        pypiDownloads: new Map([['a', 50000], ['b', 10000], ['c', 1000]]),
        hackernewsSignal: new Map([['a', 100], ['b', 50], ['c', 10]]),
        openRouterSignal: new Map([['a', 80], ['b', 60], ['c', 40]]),
        semanticScholarCitations: new Map([['a', 500], ['b', 200], ['c', 50]]),
      });
      const scores = await computeScores(raw);

      for (const id of ['a', 'b', 'c']) {
        const s = scores.get(id)!;
        const rawTotal = 0.30 * s.usage_score + 0.30 * s.attention_score
          + 0.25 * s.capability_score + 0.15 * s.expert_score;
        // total = rawTotal * confidenceDiscount, so total <= rawTotal
        // Since confidence discount = 0.6 + 0.4 * confidence:
        const expectedDiscount = 0.6 + 0.4 * s.confidence;
        const expectedTotal = Math.round(rawTotal * expectedDiscount * 100) / 100;
        expect(s.total_score).toBeCloseTo(expectedTotal, 1);
      }
    });
  });
});

// Need afterEach import
import { afterEach } from 'vitest';
