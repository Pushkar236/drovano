/**
 * Provider routing (ADR-0010, amended by ADR-0014): logical tiers, not
 * model ids, at call sites — workers say "fast" and the router picks
 * the wire model, so upgrades and BYO-provider routing are config,
 * never code changes.
 *
 * Language providers in precedence order: Anthropic (first-party key),
 * then OpenRouter (zero-cost posture: free, tool-capable models over
 * the OpenAI-compatible endpoint). OpenAI supplies embeddings only.
 * No key → that capability is disabled, same posture as
 * SENTRY_DSN/REDIS_URL: features degrade, boot never fails.
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

/**
 * Free, tool-capable models (verified against the OpenRouter catalog
 * and smoke-tested through the tool loop, 2026-07-08). Free endpoints
 * are shared pools and 429 when congested — override per tier via
 * OPENROUTER_*_MODEL when a listing rotates or degrades.
 */
const OPENROUTER_TIER_MODELS: Record<ModelTier, string> = {
  fast: 'openai/gpt-oss-20b:free',
  balanced: 'nvidia/nemotron-3-super-120b-a12b:free',
  frontier: 'openai/gpt-oss-120b:free',
};

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

export class AiDisabledError extends Error {
  constructor(capability: 'language' | 'embedding') {
    super(
      capability === 'language'
        ? 'Language models are disabled: set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.'
        : 'Embeddings are disabled: set OPENAI_API_KEY.',
    );
    this.name = 'AiDisabledError';
  }
}

export interface ModelRouterEnv {
  ANTHROPIC_API_KEY?: string | undefined;
  OPENROUTER_API_KEY?: string | undefined;
  /** Per-tier model overrides for OpenRouter (free catalog rotates). */
  OPENROUTER_FAST_MODEL?: string | undefined;
  OPENROUTER_BALANCED_MODEL?: string | undefined;
  OPENROUTER_FRONTIER_MODEL?: string | undefined;
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
  const openRouterKey = env.OPENROUTER_API_KEY;
  const openAiKey = env.OPENAI_API_KEY;

  const anthropic =
    anthropicKey !== undefined && anthropicKey !== ''
      ? createAnthropic({ apiKey: anthropicKey })
      : undefined;
  // OpenRouter speaks the OpenAI chat-completions protocol; .chat() is
  // required (the provider's default responses API is OpenAI-only).
  const openRouter =
    openRouterKey !== undefined && openRouterKey !== ''
      ? createOpenAI({ apiKey: openRouterKey, baseURL: OPENROUTER_BASE_URL })
      : undefined;
  const openRouterModels: Record<ModelTier, string> = {
    fast: env.OPENROUTER_FAST_MODEL ?? OPENROUTER_TIER_MODELS.fast,
    balanced: env.OPENROUTER_BALANCED_MODEL ?? OPENROUTER_TIER_MODELS.balanced,
    frontier: env.OPENROUTER_FRONTIER_MODEL ?? OPENROUTER_TIER_MODELS.frontier,
  };
  const openai =
    openAiKey !== undefined && openAiKey !== '' ? createOpenAI({ apiKey: openAiKey }) : undefined;

  const languageEnabled =
    anthropic !== undefined ||
    openRouter !== undefined ||
    Object.keys(overrides.languageModels ?? {}).length > 0;
  const embeddingsEnabled = openai !== undefined || overrides.embeddingModel !== undefined;

  return {
    languageEnabled,
    embeddingsEnabled,
    languageModel: (tier) => {
      const override = overrides.languageModels?.[tier];
      if (override !== undefined) return override;
      if (anthropic !== undefined) return anthropic(ANTHROPIC_TIER_MODELS[tier]);
      if (openRouter !== undefined) return openRouter.chat(openRouterModels[tier]);
      throw new AiDisabledError('language');
    },
    embeddingModel: () => {
      if (overrides.embeddingModel !== undefined) return overrides.embeddingModel;
      if (openai === undefined) throw new AiDisabledError('embedding');
      return openai.embedding(OPENAI_EMBEDDING_MODEL);
    },
  };
}
