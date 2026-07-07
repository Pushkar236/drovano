import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  connectionString: string;
  /** Pool size. Keep modest: Neon pools upstream (ADR-0006). */
  max?: number;
}

/**
 * The only way to construct a database handle. Production code receives a
 * `Database` (or a tenant-scoped transaction via `withTenant`) — never a
 * raw pg client — so tenancy discipline has a single choke point.
 */
export function createDb(options: CreateDbOptions): DbHandle {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
  });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    close: () => pool.end(),
  };
}
