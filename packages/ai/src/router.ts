/**
 * Provider routing (ADR-0010): logical tiers, not model ids, at call
 * sites — workers say "fast" and the router picks the wire model, so
 * upgrades and BYO-provider routing are config, never code changes.
 *
 * Anthropic is the language provider; OpenAI supplies embeddings only
 * (Anthropic has no embeddings API). No key → that capability is
 * disabled, same posture as SENTRY_DSN/REDIS_URL: features degrade,
 * boot never fails.
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel, LanguageModel } from 'ai';

export type ModelTier = 'fast' | 'balanced' | 'frontier';

const ANTHROPIC_TIER_MODELS: Record<ModelTier, string> = {
  fast: 'claude-haiku-4-5-20251001',
  balanced: 'claude-sonnet-5',
  frontier: 'claude-opus-4-8',
};

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

export class AiDisabledError extends Error {
  constructor(capability: 'language' | 'embedding') {
    super(
      capability === 'language'
        ? 'Language models are disabled: set ANTHROPIC_API_KEY.'
        : 'Embeddings are disabled: set OPENAI_API_KEY.',
    );
    this.name = 'AiDisabledError';
  }
}

export interface ModelRouterEnv {
  ANTHROPIC_API_KEY?: string | undefined;
  OPENAI_API_KEY?: string | undefined;
}

export interface ModelRouterOverrides {
  /** Test seam: inject stub models per tier (ai/test mocks). */
  languageModels?: Partial<Record<ModelTier, LanguageModel>>;
  embeddingModel?: EmbeddingModel;
}

export interface ModelRouter {
  /** True when at least one language tier can be served. */
  languageEnabled: boolean;
  embeddingsEnabled: boolean;
  /** Throws AiDisabledError when no provider serves the capability. */
  languageModel: (tier: ModelTier) => LanguageModel;
  embeddingModel: () => EmbeddingModel;
}

export function createModelRouter(
  env: ModelRouterEnv,
  overrides: ModelRouterOverrides = {},
): ModelRouter {
  const anthropicKey = env.ANTHROPIC_API_KEY;
  const openAiKey = env.OPENAI_API_KEY;

  const anthropic =
    anthropicKey !== undefined && anthropicKey !== ''
      ? createAnthropic({ apiKey: anthropicKey })
      : undefined;
  const openai =
    openAiKey !== undefined && openAiKey !== '' ? createOpenAI({ apiKey: openAiKey }) : undefined;

  const languageEnabled =
    anthropic !== undefined || Object.keys(overrides.languageModels ?? {}).length > 0;
  const embeddingsEnabled = openai !== undefined || overrides.embeddingModel !== undefined;

  return {
    languageEnabled,
    embeddingsEnabled,
    languageModel: (tier) => {
      const override = overrides.languageModels?.[tier];
      if (override !== undefined) return override;
      if (anthropic === undefined) throw new AiDisabledError('language');
      return anthropic(ANTHROPIC_TIER_MODELS[tier]);
    },
    embeddingModel: () => {
      if (overrides.embeddingModel !== undefined) return overrides.embeddingModel;
      if (openai === undefined) throw new AiDisabledError('embedding');
      return openai.embedding(OPENAI_EMBEDDING_MODEL);
    },
  };
}
