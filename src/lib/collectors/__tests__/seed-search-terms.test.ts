import { describe, it, expect } from 'vitest';
import { SEED_ENTITIES } from '@/app/api/admin/seed-entities/route';

/**
 * Text-search sources where generic terms cause false positives.
 * These sources do keyword matching against titles/content, so
 * single-word terms like "Sora" or "Claude" will match unrelated posts.
 */
const TEXT_SEARCH_SOURCES = ['hackernews', 'smolai', 'reddit', 'arxiv', 'manifoldMarkets'] as const;

/**
 * Approved single-word search terms.
 *
 * These are brand names / coined words unlikely to match unrelated content.
 * To add a new entry: confirm the term is not a common English word, person's
 * name, or generic tech term, then add it here with a brief justification.
 */
const ALLOWED_SINGLE_WORDS = new Set([
  // Unique brand names — no common English meaning
  'ChatGPT',
  'Midjourney',
  'Tabnine',
  'ElevenLabs',
  'NotebookLM',
  'HuggingChat',
  'AutoGPT',
  'Auto-GPT',
  'CrewAI',
  'LangChain',
  'OpenClaw',
  'Clawdbot',
  'Moltbot',
  'CharacterAI',
  'Character.ai',
  'StepFun',

  // Specific product names with no common-word collision
  'Windsurf',
  'Devstral',
  'Ministral',
  'Udio',
  'Cohere',
  'Moonshot',

  // Versioned / hyphenated terms — specific enough to avoid noise
  'GPT-4o',
  'GPT4o',
  'GPT-4.5',
  'GPT-4.1',
  'GPT-5',
  'GPT-5-mini',
  'GPT-5.1',
  'GPT-5.1-Codex-Max',
  'GPT-5.2',
  'GPT-5.2-Codex',
  'GPT-5.2-Pro',
  'GPT-5.3',
  'GPT-5.3-Codex',
  'GPT-5.1-Codex',
  'GPT-5.3-Codex-Spark',
  'GPT-OSS',
  'GPT-4o-mini',
  'DALL-E',
  'DeepSeek-Coder',
  'DeepSeek-R1',
  'DeepSeek-V3',
  'DeepSeek-V3.2',
  'GLM-5',
  'GLM-4',
  'GLM-4.7',
  'MiniMax',
  'MiniMax-01',
  'SD3.5',
  'o3-mini',
  'browser-use',
  'gpt-audio',
  'gpt-audio-mini',
  'Qwen',
  'Qwen2.5',
  'Qwen3',
  'Qwen3.5',
  'Qwen3.5-Plus',
  'MiniMax-01',
  'Zhipu',
]);

const MIN_TERM_LENGTH = 3;

describe('Seed entity search terms', () => {
  it('should not have terms shorter than 3 characters in text-search sources', () => {
    const violations: string[] = [];

    for (const entity of SEED_ENTITIES) {
      for (const source of TEXT_SEARCH_SOURCES) {
        const terms = entity.sources[source];
        if (!terms || typeof terms === 'string') continue;

        for (const term of terms) {
          if (term.length < MIN_TERM_LENGTH) {
            violations.push(
              `Entity "${entity.id}": term "${term}" in ${source} is shorter than ${MIN_TERM_LENGTH} characters.`
            );
          }
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('should not have unapproved single-word terms in text-search sources', () => {
    const violations: string[] = [];

    for (const entity of SEED_ENTITIES) {
      for (const source of TEXT_SEARCH_SOURCES) {
        const terms = entity.sources[source];
        if (!terms || typeof terms === 'string') continue;

        for (const term of terms) {
          const isSingleWord = !term.includes(' ');
          if (isSingleWord && !ALLOWED_SINGLE_WORDS.has(term)) {
            violations.push(
              `Entity "${entity.id}": term "${term}" in ${source} is a single word not in the allowlist. ` +
              `Add a qualifier (e.g., "OpenAI Sora") or add to ALLOWED_SINGLE_WORDS with justification.`
            );
          }
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
