import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDb, type DbHandle } from '../src/client.js';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  /**
   * Superuser/owner connection: migrations and test seeding only. Postgres
   * superusers carry BYPASSRLS, so nothing asserted through this handle
   * says anything about isolation. Mirrors production, where provisioning
   * runs under a privileged system role, never the app role.
   */
  owner: DbHandle;
  /**
   * Connection authenticated as `drovano_app` — the exact posture of the
   * production API. All isolation assertions go through this handle.
   */
  app: DbHandle;
  stop: () => Promise<void>;
}

/**
 * Real-Postgres test harness (TESTING.md rule 3): one ephemeral
 * Postgres 18 container (pgvector build — migration 0012 creates the
 * `vector` extension; Neon ships it natively), migrated with the
 * production migrations, plus an app-role connection. Postgres 18 is
 * required for native uuidv7().
 *
 * The production role is NOLOGIN; tests grant it a password login so they
 * can connect with the same privileges the API will have.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg18').start();

  const owner = createDb({ connectionString: container.getConnectionUri(), max: 2 });
  await migrate(owner.db, { migrationsFolder: MIGRATIONS_FOLDER });
  await owner.pool.query(`alter role drovano_app login password 'drovano_app_test'`);

  const appUri = new URL(container.getConnectionUri());
  appUri.username = 'drovano_app';
  appUri.password = 'drovano_app_test';
  const app = createDb({ connectionString: appUri.toString(), max: 2 });

  return {
    container,
    owner,
    app,
    stop: async () => {
      await app.close();
      await owner.close();
      await container.stop();
    },
  };
}
