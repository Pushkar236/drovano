import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  // `drizzle-kit migrate` runs as the owner role against the DIRECT
  // (non-pooler) endpoint; the app never uses this connection string.
  dbCredentials: {
    url: process.env.MIGRATE_DATABASE_URL ?? '',
  },
  // drovano_app is provisioned by migration 0001 with explicit grants,
  // not managed by drizzle-kit (it is declared `.existing()` in the schema).
  entities: {
    roles: {
      exclude: ['drovano_app'],
    },
  },
});
