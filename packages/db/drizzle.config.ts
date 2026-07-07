import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  // drovano_app is provisioned by migration 0001 with explicit grants,
  // not managed by drizzle-kit (it is declared `.existing()` in the schema).
  entities: {
    roles: {
      exclude: ['drovano_app'],
    },
  },
});
