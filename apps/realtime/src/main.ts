import process from 'node:process';

import { createDb } from '@drovano/db';
import { createAuth, createDevMailer } from '@drovano/identity';
import { z } from 'zod';

import { createGateway } from './gateway.js';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  BASE_URL: z.url(),
  REDIS_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3001),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}
const env = parsed.data;

const stdout = (line: string): void => {
  process.stdout.write(line);
};

const dbHandle = createDb({ connectionString: env.DATABASE_URL, max: 3 });
// Session validation only — this service never sends mail or mutates.
const auth = createAuth({
  db: dbHandle.db,
  secret: env.AUTH_SECRET,
  baseUrl: env.BASE_URL,
  mailer: createDevMailer(stdout),
});

const gateway = createGateway({ auth, redisUrl: env.REDIS_URL, port: env.PORT });
stdout(`drovano realtime gateway listening on :${String(env.PORT)}\n`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void Promise.allSettled([gateway.close(), dbHandle.close()]).then(() => {
      process.exit(0);
    });
  });
}
