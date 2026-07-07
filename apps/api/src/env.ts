import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  BASE_URL: z.url({ error: 'BASE_URL must be a full origin, e.g. http://localhost:3000' }),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Optional: error monitoring stays disabled without it (telemetry README). */
  SENTRY_DSN: z.string().optional(),
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
