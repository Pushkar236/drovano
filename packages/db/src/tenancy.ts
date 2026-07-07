import { sql } from 'drizzle-orm';

import type { Database } from './client.js';

/** A database handle scoped to one tenant for the duration of a transaction. */
export type TenantTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class InvalidTenantIdError extends Error {
  constructor(received: string) {
    super(
      `withTenant requires a UUID tenant id; received ${JSON.stringify(received)}. ` +
        'Tenant ids come from the session or job payload — never from user input directly.',
    );
    this.name = 'InvalidTenantIdError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The one blessed way to touch tenant data (docs/architecture/multi-tenancy.md §3).
 *
 * Opens a transaction and sets `app.current_tenant_id` with transaction-local
 * scope, which is what makes this safe under transaction-mode connection
 * pooling: the setting can never leak onto another request's connection.
 * `set_config(…, true)` is the parameterizable equivalent of SET LOCAL.
 *
 * All queries inside `fn` run under the RLS policies keyed on that GUC.
 * Code that needs cross-tenant access (migrations, tenant provisioning,
 * GDPR export) is a system-role concern and does not use this helper.
 */
export async function withTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(tenantId)) {
    throw new InvalidTenantIdError(tenantId);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
