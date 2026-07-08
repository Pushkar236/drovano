import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  BASE_URL: z.url({ error: 'BASE_URL must be a full origin, e.g. http://localhost:3000' }),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Optional: error monitoring stays disabled without it (telemetry README). */
  SENTRY_DSN: z.string().optional(),
  /** Optional: realtime invalidation is a no-op without it (ADR-0003). */
  REDIS_URL: z.string().optional(),
  /** Optional: language models disabled without one of these (ADR-0014). */
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_FAST_MODEL: z.string().optional(),
  OPENROUTER_BALANCED_MODEL: z.string().optional(),
  OPENROUTER_FRONTIER_MODEL: z.string().optional(),
  /** Optional: hosted embeddings; without it the LOCAL model serves. */
  OPENAI_API_KEY: z.string().optional(),
  /** 'off' disables dense retrieval entirely (e.g. memory-tight hosts). */
  EMBEDDINGS: z.enum(['auto', 'off']).default('auto'),
  DEPLOY_ENV: z.enum(['development', 'staging', 'production']).default('development'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validate configuration at boot — fail fast with actionable messages. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
